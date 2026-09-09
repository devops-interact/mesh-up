"""Run CPU-bound work off the asyncio event loop."""
from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Callable, TypeVar

T = TypeVar("T")

_executor: ThreadPoolExecutor | None = None


def get_cpu_executor() -> ThreadPoolExecutor:
    global _executor
    if _executor is None:
        _executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="cpu-worker")
    return _executor


async def run_cpu_bound(fn: Callable[..., T], *args, **kwargs) -> T:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(
        get_cpu_executor(),
        partial(fn, *args, **kwargs),
    )
