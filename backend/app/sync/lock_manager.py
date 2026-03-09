import asyncio
import os

class FileLockManager:
    def __init__(self):
        self.locks = {}
        self.global_lock = asyncio.Lock()

    async def get_lock(self, path: str):
        abs_path = os.path.abspath(path)
        async with self.global_lock:
            if abs_path not in self.locks:
                self.locks[abs_path] = asyncio.Lock()
            return self.locks[abs_path]