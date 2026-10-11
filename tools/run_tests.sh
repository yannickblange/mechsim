#!/usr/bin/env bash
# Build, then run native tests (ctest) and Python tests (pytest).
set -euo pipefail
cd "$(dirname "$0")/.."
./tools/build.sh
ctest --test-dir build --output-on-failure
python3 -m pytest "$@"
