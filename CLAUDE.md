# MechSim: instructions for Claude Code

Planar multibody simulator (x, y, phi per body), Technische Mechanik components.
C (linalg), C++17 (engine), Python (binding + FastAPI server), HTML/JS canvas frontend.

## Shared rules and contracts
@QWEN.md
@docs/tickets/v0.1/README.md
@docs/formulation.md
@contracts/units.md

## How Claude works in this repo
- Claude works in the worktree ~/Software/mechsim-claude. Two local Qwen agents work in
  ~/Software/mechsim-agentA (C/C++ tickets A1-A8) and ~/Software/mechsim-agentB (Python/web B1-B5).
- Before starting a ticket, check with `git branch -a` and `git log --oneline main` which steps are
  already done. Never check out a branch an agent is currently using; ask first.
- Step-by-step specs are in `docs/tickets/v0.1/steps/` (read the relevant step on demand).
  Ticket specs are in `docs/tickets/v0.1/*.md`.
- Commit with the step id, e.g. "[A1.2] la_lu_factor". Never merge into main; the human merges.
- Frozen files from QWEN.md stay frozen unless the human assigns the integration ticket.

## Environment (macOS, Apple Silicon)
- Build: ./tools/build.sh   Tests: ctest --test-dir build --output-on-failure and .venv/bin/python -m pytest -q
- Use the worktree's own .venv (.venv/bin/python). SDKROOT must point to the macOS 26 SDK
  (set in ~/.zshrc) because the installed macOS 27 SDK breaks the linker.
