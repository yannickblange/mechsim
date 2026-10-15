#!/usr/bin/env bash
# Start the web server. Pass --mock to run without the native library.
# Then open http://127.0.0.1:8000
# Uses the project's .venv if there is one (python3 -m venv .venv && .venv/bin/python -m pip install -e ".[dev]"), else python3.
set -euo pipefail
cd "$(dirname "$0")/.."
PY=python3
if [ -x .venv/bin/python ]; then PY=.venv/bin/python; fi
if ! "$PY" -c "import fastapi, uvicorn" 2>/dev/null; then
  echo "fastapi / uvicorn are missing for $PY. Set up once:  python3 -m venv .venv && .venv/bin/python -m pip install -e \".[dev]\"" >&2
  exit 1
fi
PYTHONPATH=python "$PY" -m mechsim.server.app "$@"
