"""Reference solutions for trusses (Fachwerke) made of nodes and Stabs, independent of the engine.

A truss scene has `node` bodies, Stabs (`rod` constraints or elastic `bar` elements between nodes),
supports on nodes (`pin_support`: x and y, `roller_support` on a horizontal floor: y) and loads and
the weight of the nodes. Used by the tests to check the engine against statics:

    joint_forces(scene)       method of joints: the member forces of a statically determinate truss
    stiffness_forces(scene)   direct stiffness method: the member forces of a truss whose members are
                              all elastic bars (also when statically indeterminate)
"""
from __future__ import annotations

from typing import Any

import numpy as np

from mechsim.analysis.sections import section_area

E_MODULUS = 210e9  # Pa, the one material of v0.4
G = 9.81


def _truss(scene: dict[str, Any]):
    nodes = {b["id"]: b for b in scene["bodies"] if b["type"] == "node"}
    index = {nid: i for i, nid in enumerate(nodes)}
    members = [c for c in scene["constraints"] if c["type"] == "rod"]
    members += [e for e in scene["elements"] if e["type"] == "bar"]
    supports = [c for c in scene["constraints"] if c["type"] in ("pin_support", "roller_support")]
    return nodes, index, members, supports


def _direction(nodes, member):
    a = np.array(nodes[member["a"]["body"]]["position"], float)
    b = np.array(nodes[member["b"]["body"]]["position"], float)
    d = b - a
    length = float(np.linalg.norm(d))
    return d / length, length


def _external(scene, nodes, index, gravity=G) -> np.ndarray:
    """Weight of the nodes and the constant loads, as a force vector [fx0, fy0, fx1, ...]."""
    f = np.zeros(2 * len(nodes))
    for nid, body in nodes.items():
        f[2 * index[nid] + 1] -= body["params"]["mass"] * gravity
    for e in scene["elements"]:
        if e["type"] == "load" and e["body"] in index and e["params"].get("mode", "constant") == "constant":
            f[2 * index[e["body"]]: 2 * index[e["body"]] + 2] += e["params"]["force"]
    # an elastic Stab has a weight of its own (v0.4b; not with one segment, the massless axial bar): half of it
    # reaches each end of a member that is simply supported by its nodes
    for e in scene["elements"]:
        params = e.get("params", {})
        if e["type"] != "bar" or params.get("segments", 4) == 1:
            continue
        a, b = (np.array(nodes[e[end]["body"]]["position"], float) for end in ("a", "b"))
        mass = params.get("mass", 7850.0 * section_area(params["section"]) * float(np.linalg.norm(b - a)))
        for end in ("a", "b"):
            if e[end]["body"] in index:
                f[2 * index[e[end]["body"]] + 1] -= 0.5 * mass * gravity
    return f


def joint_forces(scene: dict[str, Any], gravity: float = G) -> dict[str, float]:
    """Member forces (tension positive) by the method of joints: at every node the member forces, the
    support reactions and the external forces are in equilibrium. Requires a statically determinate
    truss (2 j = members + reactions, no mechanism); raises ValueError otherwise."""
    nodes, index, members, supports = _truss(scene)
    unknowns = len(members) + sum(2 if c["type"] == "pin_support" else 1 for c in supports)
    A = np.zeros((2 * len(nodes), unknowns))
    for k, m in enumerate(members):
        u, _ = _direction(nodes, m)
        ia, ib = 2 * index[m["a"]["body"]], 2 * index[m["b"]["body"]]
        A[ia:ia + 2, k] += u  # tension pulls a towards b and b towards a
        A[ib:ib + 2, k] -= u
    col = len(members)
    for c in supports:
        i = index[c["body"]]
        if c["type"] == "pin_support":
            A[2 * i, col] = 1
            A[2 * i + 1, col + 1] = 1
            col += 2
        else:
            A[2 * i + 1, col] = 1
            col += 1
    if unknowns != A.shape[0] or np.linalg.matrix_rank(A) != unknowns:
        raise ValueError("not statically determinate (2 j != members + reactions) or a mechanism")
    x = np.linalg.solve(A, -_external(scene, nodes, index, gravity))  # A x + external = 0
    return {m["id"]: float(x[k]) for k, m in enumerate(members)}


def stiffness_forces(scene: dict[str, Any], gravity: float = G) -> dict[str, float]:
    """Member forces of a truss of elastic bars by the direct stiffness method (K u = f)."""
    nodes, index, members, supports = _truss(scene)
    if any(m["type"] != "bar" for m in members):
        raise ValueError("every member must be an elastic bar")
    ndof = 2 * len(nodes)
    K = np.zeros((ndof, ndof))
    stiffness = {}
    for m in members:
        u, length = _direction(nodes, m)
        EA = E_MODULUS * section_area(m["params"]["section"])
        stiffness[m["id"]] = EA / length
        k = EA / length * np.outer(u, u)
        ia, ib = 2 * index[m["a"]["body"]], 2 * index[m["b"]["body"]]
        K[ia:ia + 2, ia:ia + 2] += k
        K[ib:ib + 2, ib:ib + 2] += k
        K[ia:ia + 2, ib:ib + 2] -= k
        K[ib:ib + 2, ia:ia + 2] -= k
    fixed = []
    for c in supports:
        i = index[c["body"]]
        fixed += [2 * i, 2 * i + 1] if c["type"] == "pin_support" else [2 * i + 1]
    free = [i for i in range(ndof) if i not in fixed]
    u = np.zeros(ndof)
    u[free] = np.linalg.solve(K[np.ix_(free, free)], _external(scene, nodes, index, gravity)[free])
    forces = {}
    for m in members:
        d, _ = _direction(nodes, m)
        ia, ib = 2 * index[m["a"]["body"]], 2 * index[m["b"]["body"]]
        forces[m["id"]] = float(stiffness[m["id"]] * d @ (u[ib:ib + 2] - u[ia:ia + 2]))
    return forces
