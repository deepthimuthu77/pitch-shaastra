from starlette.responses import PlainTextResponse


class BodyLimitMiddleware:
    def __init__(self, app, limit=2_000_000):
        self.app, self.limit = app, limit

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] not in {"POST", "PUT", "PATCH"}:
            return await self.app(scope, receive, send)
        chunks, size = [], 0
        while True:
            event = await receive()
            if event["type"] == "http.disconnect":
                return
            size += len(event.get("body", b""))
            if size > self.limit:
                return await PlainTextResponse("Request too large", status_code=413)(scope, receive, send)
            chunks.append(event)
            if not event.get("more_body", False):
                break
        position = 0

        async def replay():
            nonlocal position
            if position < len(chunks):
                event = chunks[position]
                position += 1
                return event
            return await receive()

        await self.app(scope, replay, send)
