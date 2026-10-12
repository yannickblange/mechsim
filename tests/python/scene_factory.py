"""Shared builder for v0.2 test scenes."""
from __future__ import annotations


def base() -> dict:
    """A small v0.2 scene using every new type."""
    return {
        "version": "0.2",
        "name": "all new types",
        "surfaces": [{"id": "s1", "p1": [0, 0], "p2": [2, 0]}],
        "bodies": [
            {"id": "m1", "type": "block", "position": [0.5, 0.1], "params": {"mass": 1, "width": 0.4, "height": 0.2}},
            {"id": "m2", "type": "disc", "position": [1.5, 0.15], "params": {"mass": 2, "radius": 0.15}},
            {"id": "m3", "type": "block", "position": [3.0, 0.5], "params": {"mass": 1, "width": 0.4, "height": 0.2}},
        ],
        "elements": [
            {"id": "k1", "type": "spring", "a": {"body": None, "point": [0, 0.1]},
             "b": {"body": "m1", "point": [-0.2, 0]}, "params": {"k": 50, "rest_length": 0.3}},
            {"id": "F1", "type": "load", "body": "m2", "point": [0.15, 0],
             "params": {"force": [3, 0], "moment": 0.5, "mode": "impulse"}},
        ],
        "constraints": [
            {"id": "A", "type": "pin_support", "body": "m1", "point": [-0.2, -0.1], "surface": "s1", "params": {"angle": 0}},
            {"id": "E", "type": "fixed_support", "body": "m3", "point": [-0.2, 0], "surface": None},
            {"id": "B", "type": "roller_support", "body": "m2", "point": [0, -0.15], "params": {"angle": 0.5}},
        ],
    }
