"""Cross-section properties of v0.4 (square, L, T, H, I) by summing rectangles: a reference for the tests,
independent of both the engine (native/engine/core/section.cpp) and the editor (frontend/.../section.js).

Seen along the member axis, y is "up" (the direction of bending in the plane), z across. Rectangles are
(z0, z1, y0, y1).
"""
from __future__ import annotations

from typing import Any

Rect = tuple[float, float, float, float]


def section_rects(s: dict[str, Any]) -> list[Rect]:
    t = s["type"]
    if t == "square":
        a = s["a"]
        return [(-a / 2, a / 2, -a / 2, a / 2)]
    b, h = s["b"], s["h"]
    if t == "L":  # leg of height h on the left, foot of width b at the bottom
        th = s["t"]
        return [(0, th, 0, h), (th, b, 0, th)]
    tf, tw = s["tf"], s["tw"]
    if t == "T":  # flange on top of a stem
        return [(-tw / 2, tw / 2, 0, h - tf), (-b / 2, b / 2, h - tf, h)]
    if t == "I":  # flanges top and bottom, web between
        return [(-b / 2, b / 2, 0, tf), (-b / 2, b / 2, h - tf, h), (-tw / 2, tw / 2, tf, h - tf)]
    if t == "H":  # the I turned by 90 degrees: flanges b tall (y), h apart (z)
        return [(0, tf, 0, b), (h - tf, h, 0, b), (tf, h - tf, b / 2 - tw / 2, b / 2 + tw / 2)]
    raise ValueError(f"unknown section type {t!r}")


def section_properties(s: dict[str, Any]) -> dict[str, float]:
    """area, centroid height above the lowest point, second moment about the centroid, depth."""
    rects = section_rects(s)
    area = sum((z1 - z0) * (y1 - y0) for z0, z1, y0, y1 in rects)
    yc = sum((z1 - z0) * (y1 - y0) * (y0 + y1) / 2 for z0, z1, y0, y1 in rects) / area
    inertia = sum((z1 - z0) * ((y1 - yc) ** 3 - (y0 - yc) ** 3) / 3 for z0, z1, y0, y1 in rects)
    ys = [y for r in rects for y in (r[2], r[3])]
    return {"area": area, "centroid": yc - min(ys), "inertia": inertia, "depth": max(ys) - min(ys)}


def section_area(s: dict[str, Any]) -> float:
    return section_properties(s)["area"]
