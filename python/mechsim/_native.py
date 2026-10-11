"""ctypes binding to libmechsim (native/include/mechsim.h).

- find_library(): MECHSIM_LIB env var first, else python/mechsim/lib/libmechsim.{dylib,so} or
  mechsim.dll; raises NativeLibraryNotFound with a hint to run tools/build.sh.
- load(): loads once (cached), declares argtypes/restype for every function in mechsim.h.
- check(code): raises NativeError(ms_last_error()) when a call returns MS_ERR.
"""
from __future__ import annotations

import ctypes
import os
from pathlib import Path

from mechsim import paths

MS_OK = 0
MS_ERR = -1
MS_STATE_STRIDE = 6

_LIB_NAMES = ("libmechsim.dylib", "libmechsim.so", "mechsim.dll")

_lib: ctypes.CDLL | None = None


class NativeLibraryNotFound(RuntimeError):
    pass


class NativeError(RuntimeError):
    pass


def find_library() -> Path:
    override = os.environ.get("MECHSIM_LIB")
    if override:
        path = Path(override)
        if not path.exists():
            raise NativeLibraryNotFound(f"MECHSIM_LIB points to a missing file: {path}")
        return path
    for name in _LIB_NAMES:
        candidate = paths.LIB_DIR / name
        if candidate.exists():
            return candidate
    raise NativeLibraryNotFound(f"libmechsim not found in {paths.LIB_DIR}; run tools/build.sh")


def _declare(lib: ctypes.CDLL) -> None:
    """argtypes/restype for every function in mechsim.h (ms_world* is an opaque c_void_p)."""
    c_double_p = ctypes.POINTER(ctypes.c_double)
    signatures = {
        "ms_version": (ctypes.c_char_p, []),
        "ms_last_error": (ctypes.c_char_p, []),
        "ms_world_create": (ctypes.c_void_p, [ctypes.c_char_p]),
        "ms_world_destroy": (None, [ctypes.c_void_p]),
        "ms_world_step": (ctypes.c_int, [ctypes.c_void_p, ctypes.c_double, ctypes.c_int]),
        "ms_world_reset": (ctypes.c_int, [ctypes.c_void_p]),
        "ms_world_time": (ctypes.c_double, [ctypes.c_void_p]),
        "ms_world_body_count": (ctypes.c_int, [ctypes.c_void_p]),
        "ms_world_get_state": (ctypes.c_int, [ctypes.c_void_p, c_double_p, ctypes.c_int]),
        "ms_world_frame_json": (ctypes.c_char_p, [ctypes.c_void_p]),
    }
    for name, (restype, argtypes) in signatures.items():
        fn = getattr(lib, name)
        fn.restype = restype
        fn.argtypes = argtypes


def load() -> ctypes.CDLL:
    global _lib
    if _lib is None:
        lib = ctypes.CDLL(str(find_library()))
        _declare(lib)
        _lib = lib
    return _lib


def last_error() -> str:
    return load().ms_last_error().decode("utf-8")


def check(code: int) -> int:
    """Return `code`, or raise NativeError with the library's message if it is MS_ERR."""
    if code == MS_ERR:
        raise NativeError(last_error())
    return code
