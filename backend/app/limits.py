import asyncio
import time
from collections import defaultdict, deque
from datetime import UTC, datetime

from .errors import APIError


class UsageLimiter:
    """Single event-loop process; no await occurs during admission changes."""

    def __init__(self):
        self.recent = defaultdict(deque)
        self.daily = {}

    def rate(self, token):
        now = time.monotonic()
        history = self.recent[token.user_id]
        while history and history[0] <= now - 60:
            history.popleft()
        if len(history) >= token.requests_per_minute:
            raise APIError("RATE_LIMITED")
        history.append(now)

    def charge(self, token):
        day = datetime.now(UTC).date()
        previous_day, count = self.daily.get(token.user_id, (day, 0))
        count = count if previous_day == day else 0
        if count >= token.daily_requests:
            raise APIError("QUOTA_EXCEEDED")
        self.daily[token.user_id] = (day, count + 1)


class ModelJobs:
    def __init__(self, settings, usage):
        self.settings, self.usage = settings, usage
        self.active_users = set()
        self.tasks = set()

    def start_job(self, token, operation):
        if token.user_id in self.active_users or len(self.active_users) >= self.settings.max_concurrent:
            raise APIError("SERVER_BUSY")
        self.usage.charge(token)
        self.active_users.add(token.user_id)

        async def execute():
            deadline = time.monotonic() + self.settings.request_deadline_seconds
            try:
                try:
                    async with asyncio.timeout(self.settings.request_deadline_seconds):
                        return await operation(deadline)
                except TimeoutError:
                    raise APIError("MODEL_TIMEOUT") from None
                except APIError as error:
                    if error.code == "MODEL_TIMEOUT":
                        # A cancelled HTTP call is not proof the GPU is immediately idle.
                        # Keep this admission slot until the original deadline.
                        await asyncio.sleep(max(0, deadline - time.monotonic()))
                    raise
            finally:
                self.active_users.discard(token.user_id)

        task = asyncio.create_task(execute())
        self.tasks.add(task)

        def finish(done):
            self.tasks.discard(done)
            if not done.cancelled():
                done.exception()  # Retrieve abandoned errors without logging payloads.

        task.add_done_callback(finish)
        return task

    async def submit(self, token, operation):
        return await asyncio.shield(self.start_job(token, operation))

    async def run(self, request, operation):
        task = self.start_job(request.state.token, operation)

        async def disconnected():
            while True:
                message = await request.receive()
                if message["type"] == "http.disconnect":
                    return

        watcher = asyncio.create_task(disconnected())
        try:
            done, _ = await asyncio.wait({task, watcher}, return_when=asyncio.FIRST_COMPLETED)
            if watcher in done:
                # Drain the bounded upstream job before releasing its slot.
                try:
                    await asyncio.shield(task)
                except APIError:
                    pass
                raise APIError("CLIENT_DISCONNECTED")
            return task.result()
        finally:
            watcher.cancel()
            await asyncio.gather(watcher, return_exceptions=True)

    async def close(self):
        if self.tasks:
            await asyncio.gather(*self.tasks, return_exceptions=True)
