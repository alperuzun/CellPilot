"""
Very small façade around your existing pipeline_runner.* classes.
You can later replace the Popen call with Celery/RQ/Dramatiq if you need
distributed execution or retries.
"""
import subprocess, uuid, os, sys
from pathlib import Path

def spawn_process(cmd: list[str]) -> str:
    task_id = uuid.uuid4().hex
    # stdout/err are redirected to per-task log files
    log_path = Path("jobs") / task_id
    log_path.parent.mkdir(exist_ok=True)
    with open(log_path.with_suffix(".log"), "w") as log:
        subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT)
    return task_id