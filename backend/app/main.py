from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import get_settings
from app.middleware.audit import AuditMiddleware

logger = logging.getLogger(__name__)
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown events."""
    # Import all models so Base.metadata is populated
    import app.models  # noqa: F401

    if settings.DEBUG:
        # In development: auto-create tables (use Alembic in production)
        from app.database import create_tables
        await create_tables()
        logger.info("Database tables ensured.")

    logger.info(f"NetHelper API starting (DEBUG={settings.DEBUG})")
    yield
    logger.info("NetHelper API shutting down.")


def create_app() -> FastAPI:
    app = FastAPI(
        title="NetHelper API",
        description="Network Management Tool - REST API",
        version="1.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # ----------------------------------------------------------------
    # CORS
    # ----------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Override in production via environment/proxy
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ----------------------------------------------------------------
    # Audit / IP extraction middleware
    # ----------------------------------------------------------------
    app.add_middleware(AuditMiddleware)

    # ----------------------------------------------------------------
    # Exception handlers
    # ----------------------------------------------------------------
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={"detail": exc.detail},
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request, exc: RequestValidationError
    ):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={"detail": exc.errors(), "body": str(exc.body)},
        )

    # ----------------------------------------------------------------
    # Include routers
    # ----------------------------------------------------------------
    from app.routers import (
        audit_log,
        auth,
        backup,
        cabinets,
        cables,
        checkmk,
        conflicts,
        connections,
        dashboard,
        devices,
        interfaces,
        ip_addresses,
        mac_entries,
        patch_panels,
        prefixes,
        scan_jobs,
        scheduled_scans,
        sites,
        switches,
        system,
        topology,
        users,
        vendors,
        vlans,
    )

    api_prefix = "/api/v1"
    app.include_router(auth.router, prefix=api_prefix)
    app.include_router(users.router, prefix=api_prefix)
    app.include_router(vendors.router, prefix=api_prefix)
    app.include_router(sites.router, prefix=api_prefix)
    app.include_router(cabinets.router, prefix=api_prefix)
    app.include_router(devices.router, prefix=api_prefix)
    app.include_router(interfaces.router, prefix=api_prefix)
    app.include_router(cables.router, prefix=api_prefix)
    app.include_router(vlans.router, prefix=api_prefix)
    app.include_router(prefixes.router, prefix=api_prefix)
    app.include_router(ip_addresses.router, prefix=api_prefix)
    app.include_router(mac_entries.router, prefix=api_prefix)
    app.include_router(scan_jobs.router, prefix=api_prefix)
    app.include_router(scheduled_scans.router, prefix=api_prefix)
    app.include_router(conflicts.router, prefix=api_prefix)
    app.include_router(audit_log.router, prefix=api_prefix)
    app.include_router(topology.router, prefix=api_prefix)
    app.include_router(dashboard.router, prefix=api_prefix)
    app.include_router(patch_panels.router, prefix=api_prefix)
    app.include_router(switches.router, prefix=api_prefix)
    app.include_router(connections.router, prefix=api_prefix)
    app.include_router(backup.router, prefix=api_prefix)
    app.include_router(system.router, prefix=api_prefix)
    app.include_router(checkmk.router, prefix=api_prefix)

    # ----------------------------------------------------------------
    # Health check
    # ----------------------------------------------------------------
    @app.get("/api/health", tags=["health"])
    async def health_check():
        from sqlalchemy import text
        from app.database import AsyncSessionLocal
        import asyncio

        db_ok = False
        redis_ok = False

        # Check DB
        try:
            async with AsyncSessionLocal() as session:
                await asyncio.wait_for(session.execute(text("SELECT 1")), timeout=2.0)
            db_ok = True
        except Exception:
            pass

        # Check Redis
        try:
            import redis.asyncio as aioredis
            r = aioredis.from_url(settings.REDIS_URL, socket_connect_timeout=2)
            await asyncio.wait_for(r.ping(), timeout=2.0)
            await r.aclose()
            redis_ok = True
        except Exception:
            pass

        overall = "ok" if (db_ok and redis_ok) else "degraded"
        return {
            "status": overall,
            "app": settings.APP_NAME,
            "db": db_ok,
            "redis": redis_ok,
        }

    # ----------------------------------------------------------------
    # Serve frontend SPA (if built)
    # ----------------------------------------------------------------
    frontend_dist = Path(__file__).parent.parent.parent / "frontend" / "dist"
    if frontend_dist.exists() and frontend_dist.is_dir():
        app.mount(
            "/",
            StaticFiles(directory=str(frontend_dist), html=True),
            name="frontend",
        )
        logger.info(f"Serving frontend from {frontend_dist}")

    return app


app = create_app()
