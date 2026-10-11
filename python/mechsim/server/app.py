"""FastAPI application factory and CLI entry point. TICKET B1 implements this file.

- create_app(sim_factory, mode) -> FastAPI
    sim_factory: Callable[[dict], SimulationLike]  builds a simulation from a scene dict
    mode: "native" | "mock"  (reported by /api/health and status messages)
  Mounts routes.router and ws.router, serves frontend/ (index.html at "/", /css, /js).
- main(argv=None): argparse --host (127.0.0.1) --port (8000) --mock;
  --mock uses server.mock.MockSimulation, otherwise mechsim.sim.Simulation (import lazily).
  Runs uvicorn.
"""
from __future__ import annotations


def create_app(sim_factory, mode: str = "native"):
    raise NotImplementedError("TODO(B1)")


def main(argv: list[str] | None = None) -> None:
    raise NotImplementedError("TODO(B1)")


if __name__ == "__main__":
    main()
