#!/usr/bin/env bash
# Configure + build the native library and tests. Copies libmechsim into python/mechsim/lib.
set -euo pipefail
cd "$(dirname "$0")/.."
BUILD_TYPE="${BUILD_TYPE:-Release}"
cmake -S . -B build -DCMAKE_BUILD_TYPE="$BUILD_TYPE"
cmake --build build --parallel
