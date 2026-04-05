"""
Concurrency primitives for the CellPilot backend.

- FileLockManager: per-file asyncio locks for safe h5ad read/write
- OutputTracker: context manager that cleans up output dirs on pipeline failure
- lock_manager: global singleton used by all routers
"""
from __future__ import annotations

import asyncio
import logging
import os
import shutil
from typing import Any, Callable, TypeVar

from fastapi.concurrency import run_in_threadpool

logger = logging.getLogger(__name__)

T = TypeVar("T")


class FileLockManager:
    """Per-file asyncio.Lock registry.

    Ensures that only one coroutine reads/writes a given .h5ad file at a time.
    Locks are created lazily on first access and keyed by absolute path.
    """

    def __init__(self) -> None:
        self._locks: dict[str, asyncio.Lock] = {}
        self._global_lock = asyncio.Lock()

    async def get_lock(self, path: str) -> asyncio.Lock:
        """Return the asyncio.Lock for *path*, creating one if needed."""
        abs_path = os.path.abspath(path)
        async with self._global_lock:
            if abs_path not in self._locks:
                self._locks[abs_path] = asyncio.Lock()
                logger.debug("Created lock for %s", abs_path)
            return self._locks[abs_path]

    async def locked_call(
        self, path: str, fn: Callable[..., T], *args: Any, **kwargs: Any
    ) -> T:
        """Acquire the per-file lock, run *fn* in the threadpool, return result.

        Shorthand for the common pattern::

            lock = await lock_manager.get_lock(path)
            async with lock:
                return await run_in_threadpool(fn, *args, **kwargs)
        """
        lock = await self.get_lock(path)
        async with lock:
            return await run_in_threadpool(fn, *args, **kwargs)


class OutputTracker:
    """Context manager: creates output_dir on enter, removes it on exception."""

    def __init__(self, output_dir: str) -> None:
        self.output_dir = output_dir

    def __enter__(self) -> OutputTracker:
        os.makedirs(self.output_dir, exist_ok=True)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: object,
    ) -> None:
        if exc_type is not None:
            logger.warning("Pipeline failed, removing %s", self.output_dir)
            shutil.rmtree(self.output_dir, ignore_errors=True)


# Global singleton — imported by routers as `from ..concurrency import lock_manager`
lock_manager = FileLockManager()
