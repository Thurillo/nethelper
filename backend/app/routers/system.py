"""System management endpoints: version info, update from GitHub."""
from __future__ import annotations

import asyncio
import json
import os
import subprocess
from pathlib import Path
from typing import Annotated, AsyncGenerator

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.dependencies import get_current_user, require_admin

router = APIRouter(prefix="/system", tags=["system"])

# Resolve paths relative to this file:
# system.py → routers/ → app/ → backend/ → APP_DIR (e.g. /opt/nethelper)
APP_DIR = Path(__file__).resolve().parents[3]
BACKEND_DIR = APP_DIR / "backend"
VENV_DIR = APP_DIR / "venv"
FRONTEND_DIR = APP_DIR / "frontend"


def _sh(cmd: str, cwd: Path | None = None) -> tuple[int, str]:
    """Run a shell command, return (returncode, combined output)."""
    env = {**os.environ, "PYTHONPATH": str(BACKEND_DIR)}
    result = subprocess.run(
        cmd, shell=True, capture_output=True, text=True,
        cwd=str(cwd or APP_DIR), env=env,
        timeout=300,
    )
    return result.returncode, (result.stdout + result.stderr).strip()


@router.get("/info")
async def get_system_info(_: Annotated[object, Depends(get_current_user)]):
    """Return current git version info."""
    _, commit_hash = _sh("git rev-parse --short HEAD")
    _, commit_msg = _sh("git log -1 --format=%s")
    _, commit_date = _sh("git log -1 --format=%ci")
    _, branch = _sh("git rev-parse --abbrev-ref HEAD")
    return {
        "hash": commit_hash,
        "message": commit_msg,
        "date": commit_date,
        "branch": branch,
    }


@router.get("/update/check")
async def check_update(_: Annotated[object, Depends(get_current_user)]):
    """Fetch remote and return available update info."""
    await asyncio.to_thread(_sh, "git fetch origin master")

    _, count_str = _sh("git rev-list HEAD..origin/master --count")
    count = int(count_str.strip() or "0")

    _, log = _sh("git log HEAD..origin/master --format=%h|%s|%ci")
    _, remote_hash = _sh("git rev-parse --short origin/master")
    _, local_hash = _sh("git rev-parse --short HEAD")

    commits = []
    if log:
        for line in log.strip().split("\n"):
            parts = line.split("|", 2)
            commits.append({
                "hash": parts[0] if parts else "",
                "message": parts[1] if len(parts) > 1 else "",
                "date": parts[2][:10] if len(parts) > 2 else "",
            })

    return {
        "has_update": count > 0,
        "commits_behind": count,
        "local_hash": local_hash,
        "remote_hash": remote_hash,
        "new_commits": commits,
    }


@router.post("/update/apply")
async def apply_update(_: Annotated[object, Depends(require_admin)]):
    """Stream the update process (SSE). Admin only."""

    async def _stream() -> AsyncGenerator[str, None]:
        def emit(msg: str, level: str = "info") -> str:
            return f"data: {json.dumps({'msg': msg, 'level': level})}\n\n"

        # ── 1. git pull ──────────────────────────────────────────────
        yield emit("📥  Download aggiornamento da GitHub...")
        rc, out = await asyncio.to_thread(_sh, "git pull --ff-only origin master")
        if rc != 0:
            yield emit(f"❌  git pull fallito: {out}", "error")
            yield emit("__DONE_ERROR__", "done")
            return
        already_uptodate = "already up to date" in out.lower()
        for line in out.split("\n"):
            if line.strip():
                yield emit(f"    {line}")

        # ── 2. Dipendenze Python ─────────────────────────────────────
        yield emit("📦  Aggiornamento dipendenze Python...")
        rc, out = await asyncio.to_thread(
            _sh, f"{VENV_DIR}/bin/pip install -q -r {BACKEND_DIR}/requirements.txt"
        )
        if rc != 0:
            yield emit(f"⚠   pip install: {out}", "warn")
        else:
            yield emit("✓   Dipendenze Python OK")

        # ── 3. Migrazioni database ───────────────────────────────────
        yield emit("🗄   Applicazione migrazioni database...")
        rc, out = await asyncio.to_thread(
            _sh, f"{VENV_DIR}/bin/alembic upgrade head", BACKEND_DIR
        )
        if rc != 0:
            yield emit(f"❌  Alembic fallito: {out}", "error")
            yield emit("__DONE_ERROR__", "done")
            return
        migrated = False
        for line in out.split("\n"):
            if line.strip():
                yield emit(f"    {line}")
                migrated = True
        if not migrated:
            yield emit("    Nessuna migrazione da applicare")
        yield emit("✓   Database OK")

        # ── 4. Frontend (solo se modificato rispetto all'ultimo build) ──
        # Usiamo un file .frontend_built_hash per tracciare l'ultimo hash
        # effettivamente compilato — così se un update precedente è fallito
        # prima del build, il prossimo aggiornamento recupera correttamente.
        built_hash_file = APP_DIR / ".frontend_built_hash"
        _, current_head = await asyncio.to_thread(_sh, "git rev-parse HEAD")
        current_head = current_head.strip()

        last_built = ""
        if built_hash_file.exists():
            last_built = built_hash_file.read_text().strip()

        if not last_built:
            # Prima volta o file mancante: controlla se il dist esiste già
            dist_index = FRONTEND_DIR / "dist" / "index.html"
            if dist_index.exists():
                # Dist già presente: confronta con ORIG_HEAD come fallback
                _, changed = await asyncio.to_thread(
                    _sh,
                    "git diff --name-only ORIG_HEAD HEAD 2>/dev/null | grep 'frontend/src' || true"
                )
                needs_build = changed.strip() != ""
            else:
                needs_build = True
        else:
            _, changed = await asyncio.to_thread(
                _sh,
                f"git diff --name-only {last_built} HEAD 2>/dev/null | grep 'frontend/src' || true"
            )
            needs_build = changed.strip() != ""

        if needs_build:
            yield emit("🔨  Ricompilazione frontend (file modificati)...")
            rc, out = await asyncio.to_thread(
                _sh, "npm install --silent && npm run build", FRONTEND_DIR
            )
            if rc != 0:
                yield emit(f"⚠   Build frontend: {out}", "warn")
            else:
                built_hash_file.write_text(current_head)
                yield emit("✓   Frontend ricompilato")
        else:
            # Aggiorna il file anche se non serve il build (hash già aggiornato)
            built_hash_file.write_text(current_head)
            yield emit("⏭   Frontend invariato, salto la compilazione")

        # ── 5. Riavvio servizio ──────────────────────────────────────
        yield emit("🔄  Riavvio servizio backend...")
        # Find active service name
        for svc in ("nethelper-backend", "nethelper-api"):
            rc_svc, _ = await asyncio.to_thread(_sh, f"systemctl is-active {svc}")
            if rc_svc == 0:
                # Delay restart so this SSE response finishes first
                _sh(
                    f"nohup sh -c 'sleep 3 && systemctl restart {svc}' "
                    f"> /dev/null 2>&1 &"
                )
                yield emit(f"✓   {svc} si riavvierà tra 3 secondi")
                break
        else:
            yield emit("⚠   Impossibile trovare il servizio systemd — riavvia manualmente", "warn")

        yield emit("__DONE_OK__", "done")

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Disabilita buffering Nginx
        },
    )


@router.post("/update/rebuild-frontend")
async def rebuild_frontend(_: Annotated[object, Depends(require_admin)]):
    """Force a frontend rebuild (npm install && npm run build). Admin only.
    Used to recover when a previous update failed before the build step.
    """

    async def _stream() -> AsyncGenerator[str, None]:
        def emit(msg: str, level: str = "info") -> str:
            return f"data: {json.dumps({'msg': msg, 'level': level})}\n\n"

        yield emit("🔨  Avvio ricompilazione frontend forzata...")
        rc, out = await asyncio.to_thread(
            _sh, "npm install --silent && npm run build", FRONTEND_DIR
        )
        if rc != 0:
            yield emit(f"❌  Build frontend fallito:\n{out}", "error")
            yield emit("__DONE_ERROR__", "done")
            return

        # Update the built hash
        built_hash_file = APP_DIR / ".frontend_built_hash"
        _, current_head = await asyncio.to_thread(_sh, "git rev-parse HEAD")
        built_hash_file.write_text(current_head.strip())

        yield emit("✓   Frontend ricompilato con successo")

        # Restart service
        yield emit("🔄  Riavvio servizio backend...")
        for svc in ("nethelper-backend", "nethelper-api"):
            rc_svc, _ = await asyncio.to_thread(_sh, f"systemctl is-active {svc}")
            if rc_svc == 0:
                _sh(f"nohup sh -c 'sleep 3 && systemctl restart {svc}' > /dev/null 2>&1 &")
                yield emit(f"✓   {svc} si riavvierà tra 3 secondi")
                break
        else:
            yield emit("⚠   Servizio non trovato — riavvia manualmente", "warn")

        yield emit("__DONE_OK__", "done")

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
