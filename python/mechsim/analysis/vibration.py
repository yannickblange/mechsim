"""Linear vibration analysis of spring-mass-damper systems (v0.9), independent of the engine.

    analyse(scene)  ->  { supported, reason, dofs, matrices, modes, undamped, loads, frf, response, ... }

The scene is linearised about its rest position (Ruhelage):

    M z'' + C z' + K z = b F(t)          z: the free coordinates after the supports have taken their share

  * the masses (block, disc, node) have the coordinates x, y, phi of their centre of mass; M = diag(m, m, J);
  * springs (k, rest length) and dampers (c) between points of masses or of the ground give the forces f(q, v), gravity and
    constant loads give the static load; K = -df/dq and C = -df/dv are taken by central differences of exactly the
    force law of docs/formulation.md (so the geometric stiffness of a stretched spring, k (L - L0) / L across its axis, is in);
  * Festlager, Einspannung and Loslager remove coordinates: the independent ones are the original coordinates that the
    constraint rows leave over, and the constraint's curvature (a pendulum on a pin) is in K through the support reaction;
  * the rest position is found by Newton's method from the initial state when the free coordinates are translations
    (a mass hanging on a spring sinks to its static deflection); otherwise the initial state is used.

The free vibration has the eigenvalues lambda of the state matrix [[0, I], [-M^-1 K, -M^-1 C]]. For a conjugate pair
lambda = -delta +- i omega_d:  omega_0 = |lambda|, Lehrsches Dämpfungsmaß D = delta / omega_0 (the share of the critical damping:
D = 1 is the aperiodic limit case), omega_d = omega_0 sqrt(1 - D^2), Abklingzeit 1 / delta, logarithmic decrement
2 pi D / sqrt(1 - D^2). Harmonic loads give the frequency response (K - Om^2 M + i Om C) X = b F with the amplification
V = |X| / static deflection and the distance eta = Om / omega_0 to the resonance.

Systems it cannot linearise honestly (rods, ropes, joints, bars, beams, contact with a surface) are reported with a reason.
"""
from __future__ import annotations

import copy
import math
from typing import Any, Callable

import numpy as np

GRAVITY = 9.81
NODE_RADIUS = 0.05  # m: the inertia of a node is that of a disc of this radius (native/engine/bodies/node.hpp)
MASS_TYPES = ("block", "disc", "node")
SUPPORT_TYPES = ("pin_support", "fixed_support", "roller_support")
CONTACT_MARGIN = 5e-3  # m: a mass this close to a surface (the engine's margin) is in contact with it

_FD_Q = 1e-5
_FD_V = 1e-4


class Unsupported(Exception):
    """The scene is not a spring-mass-damper system that can be linearised; the message says why (German: it is shown)."""


def _label(obj: dict[str, Any]) -> str:
    return str(obj.get("label") or obj.get("id"))


# --- the system ------------------------------------------------------------------------------------------------------------------

class _System:
    def __init__(self, scene: dict[str, Any]) -> None:
        self.scene = scene
        self.gravity = np.array(scene.get("gravity", [0.0, -GRAVITY]), float)
        bodies = scene.get("bodies", [])
        elements = scene.get("elements", [])
        constraints = scene.get("constraints", [])
        for b in bodies:
            if b["type"] not in MASS_TYPES:
                raise Unsupported(f"„{_label(b)}“ ist ein {b['type']}: Balken lassen sich hier nicht linearisieren.")
        for e in elements:
            if e["type"] not in ("spring", "damper", "load"):
                raise Unsupported(f"„{_label(e)}“ ({e['type']}): elastische Stäbe und Balken lassen sich hier nicht linearisieren.")
        for c in constraints:
            if c["type"] not in SUPPORT_TYPES:
                raise Unsupported(f"„{_label(c)}“ ({c['type']}): Stäbe, Seile und Gelenke lassen sich hier nicht linearisieren.")
        if not bodies:
            raise Unsupported("Der Aufbau hat keine Masse.")
        self.bodies = bodies
        self.index = {b["id"]: i for i, b in enumerate(bodies)}
        n = len(bodies)
        self.n = 3 * n
        self.mass = np.array([self._mass(b) for b in bodies])
        self.inertia = np.array([self._inertia(b) for b in bodies])
        self.alpha = np.array([float(b["params"].get("damping", 0.0)) if b["type"] == "node" else 0.0 for b in bodies])
        self.M = np.diag(np.repeat(self.mass, 3) * np.tile([1.0, 1.0, 0.0], n) + np.tile([0.0, 0.0, 1.0], n) * np.repeat(self.inertia, 3))
        self.q0 = np.array([c for b in bodies for c in (b["position"][0], b["position"][1], b.get("angle", 0.0))], float)
        self.v0 = np.array([c for b in bodies for c in (*b.get("velocity", [0.0, 0.0]), b.get("omega", 0.0))], float)
        self.springs = [e for e in elements if e["type"] == "spring"]
        self.dampers = [e for e in elements if e["type"] == "damper"]
        self.loads = [e for e in elements if e["type"] == "load"]
        self.supports = [c for c in constraints if c["type"] in SUPPORT_TYPES and c.get("body") is not None]
        if not self.springs:
            raise Unsupported("Der Aufbau hat keine Feder: es gibt keine Rückstellkraft.")
        self.rest = {s["id"]: float(s["params"].get("rest_length", self._length(s, self.q0))) for s in self.springs}
        self._check_contacts()

    @staticmethod
    def _mass(b: dict[str, Any]) -> float:
        return float(b["params"]["mass"])

    @staticmethod
    def _inertia(b: dict[str, Any]) -> float:
        p, m = b["params"], float(b["params"]["mass"])
        if b["type"] == "block":
            return m * (p["width"] ** 2 + p["height"] ** 2) / 12.0
        if b["type"] == "disc":
            return 0.5 * m * p["radius"] ** 2
        return 0.5 * m * NODE_RADIUS ** 2

    # a mass on a surface is in contact (friction, impacts): not linear
    def _check_contacts(self) -> None:
        linked = {(c["body"], c.get("surface")) for c in self.supports if c.get("surface")}
        for b in self.bodies:
            if b["type"] == "node":
                continue
            for s in self.scene.get("surfaces", []):
                if (b["id"], s["id"]) in linked:
                    continue
                if _gap(b, s) < CONTACT_MARGIN:
                    raise Unsupported(f"„{_label(b)}“ liegt auf der Fläche „{s['id']}“: Kontakt und Coulomb-Reibung sind nicht linear.")

    # --- geometry ---
    def anchor(self, q: np.ndarray, v: np.ndarray, anchor: dict[str, Any]):
        """(position, velocity, body index or None, lever r) of an anchor {body, point}."""
        p = np.array(anchor["point"], float)
        if anchor["body"] is None:
            return p, np.zeros(2), None, np.zeros(2)
        i = self.index[anchor["body"]]
        x, y, phi = q[3 * i: 3 * i + 3]
        c, s = math.cos(phi), math.sin(phi)
        r = np.array([c * p[0] - s * p[1], s * p[0] + c * p[1]])
        vx, vy, om = v[3 * i: 3 * i + 3]
        return np.array([x, y]) + r, np.array([vx - om * r[1], vy + om * r[0]]), i, r

    def _length(self, spring: dict[str, Any], q: np.ndarray) -> float:
        a = self.anchor(q, np.zeros(self.n), spring["a"])[0]
        b = self.anchor(q, np.zeros(self.n), spring["b"])[0]
        return float(np.linalg.norm(b - a))

    @staticmethod
    def _apply(f: np.ndarray, i: int | None, r: np.ndarray, force: np.ndarray) -> None:
        if i is None:
            return
        f[3 * i] += force[0]
        f[3 * i + 1] += force[1]
        f[3 * i + 2] += r[0] * force[1] - r[1] * force[0]

    def forces(self, q: np.ndarray, v: np.ndarray, constant_loads: bool = True) -> np.ndarray:
        """Generalised force f(q, v): gravity, springs, dampers, damping of the nodes and (optionally) the constant loads."""
        f = np.zeros(self.n)
        for i, m in enumerate(self.mass):
            f[3 * i] += m * self.gravity[0]
            f[3 * i + 1] += m * self.gravity[1]
            f[3 * i] -= self.alpha[i] * m * v[3 * i]
            f[3 * i + 1] -= self.alpha[i] * m * v[3 * i + 1]
            f[3 * i + 2] -= self.alpha[i] * self.inertia[i] * v[3 * i + 2]
        for s in self.springs:
            pa, _, ia, ra = self.anchor(q, v, s["a"])
            pb, _, ib, rb = self.anchor(q, v, s["b"])
            d = pb - pa
            length = float(np.linalg.norm(d))
            if length < 1e-12:
                continue
            u = d / length
            tension = float(s["params"]["k"]) * (length - self.rest[s["id"]])
            self._apply(f, ia, ra, tension * u)
            self._apply(f, ib, rb, -tension * u)
        for dmp in self.dampers:
            pa, va, ia, ra = self.anchor(q, v, dmp["a"])
            pb, vb, ib, rb = self.anchor(q, v, dmp["b"])
            d = pb - pa
            length = float(np.linalg.norm(d))
            if length < 1e-12:
                continue
            u = d / length
            force = float(dmp["params"]["c"]) * float(u @ (vb - va))
            self._apply(f, ia, ra, force * u)
            self._apply(f, ib, rb, -force * u)
        if constant_loads:
            for ld in self.loads:
                if ld["params"].get("mode", "constant") != "constant":
                    continue
                self._load(f, q, ld, 1.0)
        return f

    def _load(self, f: np.ndarray, q: np.ndarray, load: dict[str, Any], scale: float) -> None:
        i = self.index[load["body"]]
        _, _, _, r = self.anchor(q, np.zeros(self.n), {"body": load["body"], "point": load["point"]})
        force = np.array(load["params"].get("force", [0.0, 0.0]), float) * scale
        f[3 * i] += force[0]
        f[3 * i + 1] += force[1]
        f[3 * i + 2] += r[0] * force[1] - r[1] * force[0] + float(load["params"].get("moment", 0.0)) * scale

    # --- constraints ---
    def rows(self, q: np.ndarray) -> np.ndarray:
        """The rows G of the supports' constraint equations (docs/formulation.md) at the pose q."""
        out: list[np.ndarray] = []
        for c in self.supports:
            i = self.index[c["body"]]
            _, _, _, r = self.anchor(q, np.zeros(self.n), {"body": c["body"], "point": c["point"]})
            perp = np.array([-r[1], r[0]])
            if c["type"] in ("pin_support", "fixed_support"):
                for axis in (0, 1):
                    row = np.zeros(self.n)
                    row[3 * i + axis] = 1.0
                    row[3 * i + 2] = perp[axis]
                    out.append(row)
                if c["type"] == "fixed_support":
                    row = np.zeros(self.n)
                    row[3 * i + 2] = 1.0
                    out.append(row)
            else:
                a = float(c["params"].get("angle", 0.0))
                nrm = np.array([-math.sin(a), math.cos(a)])
                row = np.zeros(self.n)
                row[3 * i], row[3 * i + 1], row[3 * i + 2] = nrm[0], nrm[1], nrm @ perp
                out.append(row)
        return np.array(out).reshape(len(out), self.n)


def _residual(sys: _System, q: np.ndarray) -> np.ndarray:
    """The values C(q) of the supports' constraint equations (0 on the manifold); the supported points stay where they were at t = 0."""
    out: list[float] = []
    for c in sys.supports:
        i = sys.index[c["body"]]
        anchor = {"body": c["body"], "point": c["point"]}
        now = sys.anchor(q, np.zeros(sys.n), anchor)[0]
        then = sys.anchor(sys.q0, np.zeros(sys.n), anchor)[0]
        d = now - then
        if c["type"] in ("pin_support", "fixed_support"):
            out += [float(d[0]), float(d[1])]
            if c["type"] == "fixed_support":
                out.append(float(q[3 * i + 2] - sys.q0[3 * i + 2]))
        else:
            a = float(c["params"].get("angle", 0.0))
            out.append(float(d @ np.array([-math.sin(a), math.cos(a)])))
    return np.array(out)


def _project(sys: _System, q: np.ndarray) -> np.ndarray:
    """q put onto the manifold of the supports by changing only the dependent coordinates (the free ones keep their values)."""
    q = q.copy()
    dep, _, _ = _free_coordinates(sys, q)
    if not dep:
        return q
    for _ in range(30):
        c = _residual(sys, q)
        if c.size == 0 or float(np.linalg.norm(c)) < 1e-13:
            break
        q[dep] -= np.linalg.lstsq(sys.rows(q)[:, dep], c, rcond=None)[0]
    return q


def _gap(body: dict[str, Any], surface: dict[str, Any]) -> float:
    """The smallest distance of a block's corners / a disc's rim to a surface (m)."""
    pts = surface.get("points") or [surface["p1"], surface["p2"]]
    x, y = body["position"]
    phi = body.get("angle", 0.0)
    if body["type"] == "disc":
        probes, radius = [(x, y)], body["params"]["radius"]
    else:
        w, h = body["params"]["width"] / 2, body["params"]["height"] / 2
        c, s = math.cos(phi), math.sin(phi)
        probes = [(x + c * a - s * b, y + s * a + c * b) for a, b in ((-w, -h), (w, -h), (w, h), (-w, h))]
        radius = 0.0
    best = math.inf
    for (px, py) in probes:
        for a, b in zip(pts, pts[1:]):
            dx, dy = b[0] - a[0], b[1] - a[1]
            len2 = dx * dx + dy * dy
            t = 0.0 if len2 == 0 else min(1.0, max(0.0, ((px - a[0]) * dx + (py - a[1]) * dy) / len2))
            best = min(best, math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy)) - radius)
    return best


# --- linearisation ---------------------------------------------------------------------------------------------------------------

def _jacobian(fun: Callable[[np.ndarray], np.ndarray], x: np.ndarray, h: float) -> np.ndarray:
    n = len(x)
    cols = []
    for j in range(n):
        e = np.zeros(n)
        e[j] = h
        cols.append((fun(x + e) - fun(x - e)) / (2 * h))
    return np.array(cols).T


def _free_coordinates(sys: _System, q: np.ndarray):
    """(dependent, independent, N) with q = q_ref + N z: the independent coordinates are original coordinates that the
    constraint rows leave over (Gaussian elimination with the largest pivot)."""
    G = sys.rows(q)
    if G.shape[0] == 0:
        return [], list(range(sys.n)), np.eye(sys.n)
    A = G.copy()
    dep: list[int] = []
    rows_left = list(range(A.shape[0]))
    for _ in range(A.shape[0]):
        best = max(((abs(A[r, c]), -c, r, c) for r in rows_left for c in range(A.shape[1]) if c not in dep), default=None)
        if best is None or best[0] < 1e-10:
            break
        _, _, r, c = best
        dep.append(c)
        rows_left.remove(r)
        for other in range(A.shape[0]):
            if other != r and abs(A[other, c]) > 0:
                A[other] -= A[other, c] / A[r, c] * A[r]
    ind = [c for c in range(sys.n) if c not in dep]
    Gd, Gi = G[:, dep], G[:, ind]
    sol = np.linalg.lstsq(Gd, Gi, rcond=None)[0] if Gd.size else np.zeros((0, len(ind)))
    N = np.zeros((sys.n, len(ind)))
    for k, c in enumerate(ind):
        N[c, k] = 1.0
    for k, c in enumerate(dep):
        N[c, :] = -sol[k, :]
    return dep, ind, N


def _dof_label(sys: _System, coord: int) -> dict[str, Any]:
    body = sys.bodies[coord // 3]
    axis = ("x", "y", "phi")[coord % 3]
    return {"body": body["id"], "axis": axis, "label": f"{axis}({_label(body)})" if axis != "phi" else f"φ({_label(body)})"}


def _rest_position(sys: _System):
    """Newton's method for the static equilibrium N^T f(q, 0) = 0 on the manifold of the supports, from the initial pose;
    returns (q, found, moved)."""
    zero_v = np.zeros(sys.n)
    q = _project(sys, sys.q0)
    scale = max(1.0, float(np.linalg.norm(sys.forces(q, zero_v))))
    for _ in range(60):
        _, _, N = _free_coordinates(sys, q)
        f = sys.forces(q, zero_v)
        res = N.T @ f
        if float(np.linalg.norm(res)) < 1e-10 * scale:
            return q, True, float(np.linalg.norm(q - sys.q0)) > 1e-9
        Mr, Cr, Kr, N, _, _ = _matrices(sys, q)
        try:
            dz = np.linalg.solve(Kr, res)
        except np.linalg.LinAlgError:
            break
        step = float(np.linalg.norm(dz))
        if not math.isfinite(step):
            break
        if step > 0.5:  # do not jump across the world
            dz *= 0.5 / step
        q = _project(sys, q + N @ dz)
    return _project(sys, sys.q0), False, False


def _matrices(sys: _System, q: np.ndarray):
    """The reduced matrices at the pose q: (Mr, Cr, Kr, N, dependent, independent, info)."""
    dep, ind, N = _free_coordinates(sys, q)
    zero_v = np.zeros(sys.n)
    K = -_jacobian(lambda x: sys.forces(x, zero_v), q, _FD_Q)
    C = -_jacobian(lambda w: sys.forces(q, w), zero_v, _FD_V)
    G = sys.rows(q)
    if G.shape[0]:  # the curvature of the constraints (a pendulum on a pin): K_r = N^T (K - d(G^T lambda)/dq) N
        f0 = sys.forces(q, zero_v)
        lam = np.linalg.lstsq(G.T, -f0, rcond=None)[0]
        T = _jacobian(lambda x: sys.rows(x).T @ lam, q, _FD_Q)
        K = K - T
    return N.T @ sys.M @ N, N.T @ C @ N, N.T @ K @ N, N, dep, ind


# --- the modes --------------------------------------------------------------------------------------------------------------------

def _kind(d: float | None, real_lambda: float | None, omega0: float | None) -> str:
    if real_lambda is not None:
        if abs(real_lambda) < 1e-9 * max(1.0, abs(omega0 or 1.0)):
            return "Starrkörper"
        return "instabil" if real_lambda > 0 else "aperiodisch"
    assert d is not None
    if d < -1e-9:
        return "instabil"
    if d < 1e-9:
        return "ungedämpft"
    return "unterkritisch"


def _modes(Mr: np.ndarray, Cr: np.ndarray, Kr: np.ndarray, labels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    n = Mr.shape[0]
    Minv = np.linalg.inv(Mr)
    A = np.block([[np.zeros((n, n)), np.eye(n)], [-Minv @ Kr, -Minv @ Cr]])
    w, V = np.linalg.eig(A)
    scale = max(1.0, float(np.max(np.abs(w))))
    used = [False] * len(w)
    modes: list[dict[str, Any]] = []
    order = sorted(range(len(w)), key=lambda i: (abs(w[i].imag) < 1e-9 * scale, abs(w[i]), -w[i].imag))
    for i in order:
        if used[i]:
            continue
        lam = w[i]
        if abs(lam.imag) > 1e-9 * scale:
            if lam.imag < 0:
                continue
            for j in range(len(w)):  # the conjugate
                if not used[j] and j != i and abs(w[j] - lam.conjugate()) < 1e-7 * scale:
                    used[j] = True
                    break
            used[i] = True
            omega0 = abs(lam)
            d = -lam.real / omega0
            d = 0.0 if abs(d) < 1e-9 else d
            modes.append(_mode(len(modes), lam, V[:n, i], labels, omega0=omega0, zeta=d, omega_d=lam.imag, real=None))
        else:
            used[i] = True
            modes.append(_mode(len(modes), lam, V[:n, i], labels, omega0=None, zeta=None, omega_d=None, real=lam.real))
    # one degree of freedom with two real eigenvalues: an overdamped (or critical) oscillator, D from the pair
    if n == 1 and len(modes) == 2 and all(m["kind"] == "aperiodisch" for m in modes):
        l1, l2 = (m["eigenvalue"][0] for m in modes)
        omega0 = math.sqrt(l1 * l2)
        d = -(l1 + l2) / (2 * omega0)
        merged = dict(modes[0])
        merged.update(index=0, omega0=omega0, f0=omega0 / (2 * math.pi), zeta=d, omega_d=0.0, f_d=0.0, eigenvalues=[[l1, 0.0], [l2, 0.0]],
                      kind="aperiodischer Grenzfall" if abs(d - 1) < 1e-6 else "überkritisch", decay_time=-1.0 / max(l1, l2),
                      log_decrement=None, critical_scale=1.0 / d)
        return [merged]
    return modes


def _mode(index: int, lam: complex, vec: np.ndarray, labels: list[dict[str, Any]], *, omega0, zeta, omega_d, real) -> dict[str, Any]:
    big = int(np.argmax(np.abs(vec)))
    vec = vec / vec[big] if abs(vec[big]) > 0 else vec
    shape = [{**lab, "re": float(v.real), "im": float(v.imag)} for lab, v in zip(labels, vec)]
    out: dict[str, Any] = {"index": index, "eigenvalue": [float(lam.real), float(lam.imag)], "shape": shape}
    if real is not None:
        out.update(kind=_kind(None, real, None), omega0=None, f0=None, zeta=None, omega_d=0.0, f_d=0.0, eigenvalues=[[float(lam.real), 0.0]],
                   decay_time=(-1.0 / real) if real < -1e-12 else None, log_decrement=None, critical_scale=None)
        return out
    delta = -lam.real
    out.update(
        kind="aperiodischer Grenzfall" if zeta > 1 - 1e-6 else _kind(zeta, None, omega0), omega0=float(omega0), f0=float(omega0 / (2 * math.pi)), zeta=float(zeta),
        omega_d=float(omega_d) if zeta <= 1 - 1e-6 else 0.0, f_d=float(omega_d / (2 * math.pi)) if zeta <= 1 - 1e-6 else 0.0, eigenvalues=[[float(lam.real), float(lam.imag)], [float(lam.real), float(-lam.imag)]],
        delta=float(delta), decay_time=float(1.0 / delta) if delta > 1e-12 else None,
        log_decrement=float(2 * math.pi * zeta / math.sqrt(1 - zeta ** 2)) if 1e-12 < zeta < 1 else (0.0 if zeta <= 1e-12 else None),
        critical_scale=float(1.0 / zeta) if zeta > 1e-12 else None,
    )
    return out


def _undamped(Mr: np.ndarray, Kr: np.ndarray, Cr: np.ndarray, labels: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The undamped natural frequencies and shapes, with each mode's modal mass, stiffness, damping and critical damping."""
    vals, vecs = np.linalg.eig(np.linalg.solve(Mr, Kr))
    out = []
    for k in np.argsort(vals.real):
        lam, phi = float(vals[k].real), np.real(vecs[:, k])
        phi = phi / phi[int(np.argmax(np.abs(phi)))] if np.max(np.abs(phi)) > 0 else phi
        m_i, k_i, c_i = float(phi @ Mr @ phi), float(phi @ Kr @ phi), float(phi @ Cr @ phi)
        omega = math.sqrt(lam) if lam > 0 else 0.0
        crit = 2.0 * math.sqrt(k_i * m_i) if k_i > 0 else None
        out.append({
            "omega": omega, "f": omega / (2 * math.pi), "stable": lam > 1e-12 * max(1.0, float(np.max(np.abs(vals)))),
            "modal_mass": m_i, "modal_stiffness": k_i, "modal_damping": c_i, "critical_damping": crit,
            "damping_ratio": (c_i / crit) if crit else None,
            "shape": [{**lab, "re": float(v)} for lab, v in zip(labels, phi)],
        })
    return out


# --- loads and the frequency response ----------------------------------------------------------------------------------------------

def _harmonic_loads(sys: _System, q: np.ndarray, N: np.ndarray, Mr: np.ndarray, Cr: np.ndarray, Kr: np.ndarray, modes: list[dict[str, Any]]):
    loads = [ld for ld in sys.loads if ld["params"].get("mode") == "harmonic"]
    if not loads:
        return [], None
    omegas = [m["omega0"] for m in modes if m["omega0"]]
    top = max([*omegas, *(2 * math.pi * float(ld["params"].get("frequency", 1.0)) for ld in loads), 1.0])
    grid = list(np.linspace(0.0, 1.6 * top, 500))
    for w0 in omegas:
        grid += list(w0 * (1 + np.linspace(-0.25, 0.25, 101)))
    grid += [2 * math.pi * float(ld["params"].get("frequency", 1.0)) for ld in loads]
    grid = sorted({round(g, 9) for g in grid if g >= 0.0})
    results, frf = [], []
    for ld in loads:
        f = np.zeros(sys.n)
        sys._load(f, q, ld, 1.0)  # unit load
        b = N.T @ f
        om = 2 * math.pi * float(ld["params"].get("frequency", 1.0))
        def response(w: float) -> np.ndarray:
            return np.linalg.solve(Kr - w * w * Mr + 1j * w * Cr, b)
        try:
            static = np.linalg.solve(Kr, b)
        except np.linalg.LinAlgError:
            static = None
        x = response(om)
        nearest = min(modes, key=lambda m: abs((m["omega0"] or 1e300) - om)) if omegas else None
        eta = om / nearest["omega0"] if nearest and nearest["omega0"] else None
        results.append({
            "id": ld["id"], "label": _label(ld), "body": ld["body"], "frequency": om / (2 * math.pi), "omega": om, "amplitude_force": float(np.linalg.norm(f[:2])) or abs(float(ld["params"].get("moment", 0.0))),
            "eta": eta, "nearest_mode": nearest["index"] if nearest else None, "resonance_distance": abs(eta - 1.0) if eta is not None else None,
            "response": [{"amplitude": float(abs(v)), "phase_deg": float(np.degrees(np.angle(v)))} for v in x],
            "static": [float(s) for s in static] if static is not None else None,
            "magnification": [float(abs(v) / abs(s)) if abs(s) > 1e-15 else None for v, s in zip(x, static)] if static is not None else None,
        })
        curve = np.array([response(w) for w in grid])
        frf.append({"id": ld["id"], "amplitude": np.abs(curve).T.tolist(), "phase_deg": np.degrees(np.angle(curve)).T.tolist(),
                    "static": [float(s) for s in static] if static is not None else None})
    return results, {"omega": grid, "f": [w / (2 * math.pi) for w in grid], "loads": frf}


# --- the answer -------------------------------------------------------------------------------------------------------------------

def _matrix(a: np.ndarray) -> list[list[float]]:
    return [[float(v) for v in row] for row in a]


def _start_pose(sys: _System, q_rest: np.ndarray, ind: list[int], offsets: dict[str, dict[str, float]]) -> np.ndarray:
    """The rest position moved by `offsets` ({body: {x, y, phi: deflection}}) along the free coordinates, the others following the supports."""
    q = q_rest.copy()
    for bid, axes in offsets.items():
        i = sys.index.get(bid)
        if i is None:
            continue
        for k, axis in enumerate(("x", "y", "phi")):
            if axis in axes and 3 * i + k in ind:
                q[3 * i + k] += float(axes[axis])
    return _project(sys, q)


def analyse(scene: dict[str, Any], *, t_max: float = 10.0, samples: int = 1500, response: bool = True,
            simulate: Callable[..., dict[str, Any]] | None = None, offsets: dict[str, dict[str, float]] | None = None) -> dict[str, Any]:
    """The linear analysis of `scene` (and, with `response`, the simulation of it as `response`): see the module doc.
    `offsets` ({body: {x, y, phi}}, from the rest position) is where the simulation starts; without it the scene's own initial state."""
    try:
        sys = _System(scene)
    except Unsupported as why:
        return {"supported": False, "reason": str(why)}
    q_rest, found, moved = _rest_position(sys)
    Mr, Cr, Kr, N, dep, ind = _matrices(sys, q_rest)
    labels = [_dof_label(sys, c) for c in ind]
    if len(ind) == 0:
        return {"supported": False, "reason": "Alle Freiheitsgrade sind durch Lager gesperrt."}
    modes = _modes(Mr, Cr, Kr, labels)
    undamped = _undamped(Mr, Kr, Cr, labels)
    loads, frf = _harmonic_loads(sys, q_rest, N, Mr, Cr, Kr, modes)
    f0 = sys.forces(q_rest, np.zeros(sys.n))
    notes: list[str] = []
    if not found:
        notes.append("Die Ruhelage konnte nicht bestimmt werden: linearisiert um den Anfangszustand.")
    if any(m["kind"] == "instabil" for m in modes):
        notes.append("Das System ist instabil (negative Steifigkeit): die Auslenkung wächst.")
    if any(m["kind"] == "Starrkörper" for m in modes):
        notes.append("Es gibt Freiheitsgrade ohne Rückstellkraft (Starrkörperbewegung).")
    out: dict[str, Any] = {
        "supported": True, "reason": None, "notes": notes,
        "dofs": labels, "mass_matrix": _matrix(Mr), "damping_matrix": _matrix(Cr), "stiffness_matrix": _matrix(Kr),
        "modes": modes, "undamped": undamped, "loads": loads, "frf": frf,
        "rest_position": {b["id"]: [float(q_rest[3 * i]), float(q_rest[3 * i + 1]), float(q_rest[3 * i + 2])] for i, b in enumerate(sys.bodies)},
        "rest_found": bool(found), "rest_moved": bool(moved),
        "initial_offset": {b["id"]: [float(sys.q0[3 * i + k] - q_rest[3 * i + k]) for k in range(3)] for i, b in enumerate(sys.bodies)},
        "masses": [{"id": b["id"], "label": _label(b), "mass": float(b["params"]["mass"])} for b in sys.bodies],
        "springs": [{"id": s["id"], "label": _label(s), "k": float(s["params"]["k"]), "rest_length": sys.rest[s["id"]]} for s in sys.springs],
        "dampers": [{"id": d["id"], "label": _label(d), "c": float(d["params"]["c"])} for d in sys.dampers],
        "static_load_norm": float(np.linalg.norm(N.T @ f0)),
    }
    if len(ind) == 1:  # the classic oscillator: m, c, k and the critical damping
        m, c, k = float(Mr[0, 0]), float(Cr[0, 0]), float(Kr[0, 0])
        out["single"] = {"m": m, "c": c, "k": k, "c_crit": 2 * math.sqrt(k * m) if k > 0 else None,
                         "damping_ratio": c / (2 * math.sqrt(k * m)) if k > 0 else None}
    out["response"] = None
    if response:
        run = simulate or _simulate
        start = scene
        if offsets is not None:
            q_start = _start_pose(sys, q_rest, ind, offsets)
            start = copy.deepcopy(scene)
            for i, b in enumerate(start["bodies"]):
                b["position"] = [float(q_start[3 * i]), float(q_start[3 * i + 1])]
                b["angle"] = float(q_start[3 * i + 2])
            out["start_offset"] = {b["id"]: [float(q_start[3 * i + k] - q_rest[3 * i + k]) for k in range(3)] for i, b in enumerate(sys.bodies)}
        try:
            out["response"] = run(start, t_max=t_max, samples=samples, rest=out["rest_position"])
        except Exception as exc:  # the analysis stands without the simulation (the mock engine has none)
            out["response"] = None
            notes.append(f"Keine Simulation: {exc}")
    return out


def _simulate(scene: dict[str, Any], *, t_max: float, samples: int, rest: dict[str, list[float]]) -> dict[str, Any]:
    """The nonlinear engine runs the scene: pose, velocity and energies at `samples` instants up to t_max."""
    from mechsim.sim import Simulation  # (numpy and the native library: not needed for the analysis itself)

    with Simulation(scene) as sim:
        dt = sim.dt
        steps = max(1, int(round(t_max / dt)))
        every = max(1, -(-steps // max(2, samples)))
        ids = [b["id"] for b in scene["bodies"]]
        t: list[float] = []
        state: list[list[float]] = []
        kinetic: list[float] = []
        potential: list[float] = []

        def sample() -> None:
            t.append(sim.time)
            state.append(sim.state().ravel().tolist())
            e = sim.frame()["energy"]
            kinetic.append(e["kinetic"])
            potential.append(e["potential"])

        sample()
        done = 0
        while done < steps:
            k = min(every, steps - done)
            sim.step(n=k)
            done += k
            sample()
    arr = np.array(state)  # samples x (bodies * 6): x, y, phi, vx, vy, omega
    bodies = {}
    for i, bid in enumerate(ids):
        cols = arr[:, 6 * i: 6 * i + 6]
        bodies[bid] = {key: cols[:, j].tolist() for j, key in enumerate(("x", "y", "phi", "vx", "vy", "omega"))}
    return {"t": t, "bodies": bodies, "kinetic": kinetic, "potential": potential, "rest": rest, "dt": dt}
