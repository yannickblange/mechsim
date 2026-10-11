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

import argparse
import asyncio
import contextlib
import sys

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from mechsim import paths
from mechsim.server import routes, ws
from mechsim.server.session import SimSession


def create_app(sim_factory, mode: str = "native") -> FastAPI:
    session = SimSession(sim_factory, mode)

    @contextlib.asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(session.run())
        try:
            yield
        finally:
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task

    app = FastAPI(title="MechSim", lifespan=lifespan)
    app.state.session = session
    app.include_router(routes.router)
    app.include_router(ws.router)

    @app.middleware("http")
    async def no_store(request, call_next):
        # Avoid stale ES modules while developing.
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/", include_in_schema=False)
    async def index():
        return FileResponse(paths.FRONTEND_DIR / "index.html")

    app.mount("/css", StaticFiles(directory=paths.FRONTEND_DIR / "css"), name="css")
    app.mount("/js", StaticFiles(directory=paths.FRONTEND_DIR / "js"), name="js")
    app.mount("/tests", StaticFiles(directory=paths.REPO_ROOT / "tests" / "frontend"), name="tests")
    return app


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="MechSim web server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--mock", action="store_true", help="run without the native engine")
    args = parser.parse_args(argv)

    if args.mock:
        from mechsim.server.mock import MockSimulation

        factory, mode = MockSimulation, "mock"
    else:
        try:
            from mechsim import _native
            from mechsim.sim import Simulation

            _native.load()  # fail now, not on the first scene load
        except Exception as exc:
            print(f"Native engine not available: {exc}. Run tools/build.sh or use --mock.")
            sys.exit(1)
        factory, mode = Simulation, "native"

    import uvicorn

    uvicorn.run(create_app(factory, mode), host=args.host, port=args.port)


if __name__ == "__main__":
    main()
