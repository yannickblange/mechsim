#!/usr/bin/env bash
# Start the web server. Pass --mock to run without the native library.
# Then open http://127.0.0.1:8000
set -euo pipefail
cd "$(dirname "$0")/.."
PYTHONPATH=python python3 -m mechsim.server.app "$@"
