"""
Simple in-memory job manager for tracking analysis progress.
In production, this would be replaced with Redis/database.
"""
import uuid
import time
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime
from pathlib import Path

class JobStatus:
    def __init__(self, job_id: str, name: str):
        self.job_id = job_id
        self.name = name
        self.status = "pending"  # pending, running, completed, failed
        self.progress = 0.0
        self.current_step = "Initializing..."
        self.message = None
        self.result = None
        self.created_at = datetime.now()
        self.started_at = None
        self.completed_at = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "job_id": self.job_id,
            "status": self.status,
            "progress": self.progress,
            "current_step": self.current_step,
            "message": self.message,
            "result": self.result
        }

class JobManager:
    def __init__(self):
        self.jobs: Dict[str, JobStatus] = {}

    def create_job(self, name: str) -> str:
        job_id = str(uuid.uuid4())
        self.jobs[job_id] = JobStatus(job_id, name)
        return job_id

    def get_job(self, job_id: str) -> Optional[JobStatus]:
        return self.jobs.get(job_id)

    def update_job(self, job_id: str, **kwargs):
        if job_id in self.jobs:
            job = self.jobs[job_id]
            for key, value in kwargs.items():
                if hasattr(job, key):
                    setattr(job, key, value)

    def start_job(self, job_id: str):
        if job_id in self.jobs:
            job = self.jobs[job_id]
            job.status = "running"
            job.started_at = datetime.now()

    def complete_job(self, job_id: str, result: Dict[str, Any]):
        if job_id in self.jobs:
            job = self.jobs[job_id]
            job.status = "completed"
            job.progress = 1.0
            job.current_step = "Completed"
            job.result = result
            job.completed_at = datetime.now()

    def fail_job(self, job_id: str, error_message: str):
        if job_id in self.jobs:
            job = self.jobs[job_id]
            job.status = "failed"
            job.message = error_message
            job.completed_at = datetime.now()

# Global job manager instance
job_manager = JobManager()