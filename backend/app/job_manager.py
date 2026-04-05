"""
In-memory job manager for tracking background analysis progress.

In production this would be backed by Redis or a database; for the
single-process desktop backend an in-memory dict is sufficient.
"""
import logging
import uuid
from datetime import datetime
from typing import Any, Dict, Optional

from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)


class JobStatus(BaseModel):
    """Internal state of a single background job."""

    job_id: str
    name: str
    status: str = "pending"  # pending | running | completed | failed
    progress: float = 0.0
    current_step: str = "Initializing..."
    message: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    created_at: datetime = Field(default_factory=datetime.now)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class JobManager:
    """Create and track background jobs by id."""

    def __init__(self) -> None:
        self._jobs: Dict[str, JobStatus] = {}

    def create_job(self, name: str) -> str:
        job_id = str(uuid.uuid4())
        self._jobs[job_id] = JobStatus(job_id=job_id, name=name)
        logger.info("Created job %s (%s)", job_id[:8], name)
        return job_id

    def get_job(self, job_id: str) -> Optional[JobStatus]:
        return self._jobs.get(job_id)

    def update_progress(
        self,
        job_id: str,
        progress: float,
        current_step: str,
    ) -> None:
        """Update the progress percentage and step description."""
        job = self._jobs.get(job_id)
        if job is None:
            logger.warning("update_progress: unknown job %s", job_id)
            return
        job.progress = progress
        job.current_step = current_step
        logger.debug("Job %s — %.0f%% %s", job_id[:8], progress * 100, current_step)

    def start_job(self, job_id: str) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            logger.warning("start_job: unknown job %s", job_id)
            return
        job.status = "running"
        job.started_at = datetime.now()
        logger.info("Job %s started", job_id[:8])

    def complete_job(self, job_id: str, result: Dict[str, Any]) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            logger.warning("complete_job: unknown job %s", job_id)
            return
        job.status = "completed"
        job.progress = 1.0
        job.current_step = "Completed"
        job.result = result
        job.completed_at = datetime.now()
        logger.info("Job %s completed", job_id[:8])

    def fail_job(self, job_id: str, error_message: str) -> None:
        job = self._jobs.get(job_id)
        if job is None:
            logger.warning("fail_job: unknown job %s", job_id)
            return
        job.status = "failed"
        job.message = error_message
        job.completed_at = datetime.now()
        logger.error("Job %s failed: %s", job_id[:8], error_message)


# Global singleton
job_manager = JobManager()
