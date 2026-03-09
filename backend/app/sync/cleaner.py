import os
import shutil
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

class OutputTracker:
    def __init__(self, output_dir: str):
        self.output_dir = output_dir

    def __enter__(self) -> OutputTracker:
        os.makedirs(self.output_dir, exist_ok=True)
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        if exc_type is not None:
            logger.warning(f"Pipeline failed, removing {self.output_dir}")
            shutil.rmtree(self.output_dir, ignore_errors=True)
        return False