from __future__ import annotations

from celery import Celery

from app.config import get_settings

settings = get_settings()

celery_app = Celery(
    "nethelper",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
    include=[
        "app.tasks.scan_tasks",
        "app.tasks.scheduled_scans",
    ],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=1,
    # Beat schedule: populated dynamically by scheduled_scans task
    beat_schedule={
        "run-scheduled-scans": {
            "task": "app.tasks.scheduled_scans.run_scheduled_scans",
            "schedule": 60.0,  # check every 60 seconds
        },
    },
)
