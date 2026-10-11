"""ctypes binding to libmechsim (native/include/mechsim.h). TICKET B5 implements this file.

Requirements (see ticket B5):
- find_library(): MECHSIM_LIB env var first, else python/mechsim/lib/libmechsim.{dylib,so} or
  mechsim.dll; raise NativeLibraryNotFound with a hint to run tools/build.sh.
- load(): load once (cache), declare argtypes/restype for EVERY function in mechsim.h.
- Raise NativeError(ms_last_error()) whenever a call returns MS_ERR / NULL.
"""
from __future__ import annotations

import ctypes
from pathlib import Path

MS_OK = 0
MS_ERR = -1
MS_STATE_STRIDE = 6


class NativeLibraryNotFound(RuntimeError):
    pass


class NativeError(RuntimeError):
    pass


def find_library() -> Path:
    raise NotImplementedError("TODO(B5)")


def load() -> ctypes.CDLL:
    raise NotImplementedError("TODO(B5)")
