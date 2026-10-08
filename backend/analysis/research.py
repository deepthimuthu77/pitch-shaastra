import ipaddress
import os
import time
from urllib.parse import urlparse

import httpx

from backend.config import settings


def safe_url(value):
    try:
        parsed = urlparse(value)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            return None
        host = parsed.hostname.lower()
        if host == "localhost" or host.endswith((".local", ".internal")):
            return None
        try:
            if not ipaddress.ip_address(host).is_global:
                return None
        except ValueError:
            pass
        return value[:2048]
    except ValueError:
        return None


async def search(query, max_results=5):
    if settings().app_mode == "demo":
        return {"items": [], "provider": "demo", "search_suggestions": "", "ms": 0}
    started = time.perf_counter()
    failures = []
    async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
        for name in os.getenv("SEARCH_CHAIN", "google,tavily,serper").split(","):
            name = name.strip()
            try:
                if name == "google" and os.getenv("GEMINI_API_KEY"):
                    model = os.getenv(
                        "GEMINI_SEARCH_MODEL", os.getenv("GEMINI_REASON_MODEL", "gemini-2.5-flash")
                    )
                    response = await client.post(
                        f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                        headers={"x-goog-api-key": os.environ["GEMINI_API_KEY"]},
                        json={
                            "contents": [
                                {
                                    "parts": [
                                        {
                                            "text": "Research these generic public market terms with Google Search. Give concise, cited factual notes; no financial forecasts. Query: "
                                            + query
                                        }
                                    ]
                                }
                            ],
                            "tools": [{"google_search": {}}],
                            "generationConfig": {"maxOutputTokens": 3000},
                        },
                    )
                    response.raise_for_status()
                    candidate = response.json().get("candidates", [{}])[0]
                    metadata = candidate.get("groundingMetadata", {})
                    chunks = metadata.get("groundingChunks", [])
                    items = []
                    for index, chunk in enumerate(chunks[:max_results]):
                        web = chunk.get("web", {})
                        snippets = [
                            support.get("segment", {}).get("text", "")
                            for support in metadata.get("groundingSupports", [])
                            if index in support.get("groundingChunkIndices", [])
                        ]
                        items.append(
                            {
                                "url": web.get("uri", ""),
                                "title": web.get("title", ""),
                                "snippet": " ".join(snippets)[:3000],
                                "published": None,
                            }
                        )
                    suggestions = metadata.get("searchEntryPoint", {}).get("renderedContent", "")[:30_000]
                elif name == "tavily" and os.getenv("TAVILY_API_KEY"):
                    response = await client.post(
                        "https://api.tavily.com/search",
                        headers={"Authorization": "Bearer " + os.environ["TAVILY_API_KEY"]},
                        json={"query": query, "max_results": max_results, "search_depth": "basic"},
                    )
                    response.raise_for_status()
                    items = [
                        {
                            "url": item["url"],
                            "title": item["title"],
                            "snippet": item.get("content", "")[:3000],
                            "published": item.get("published_date"),
                        }
                        for item in response.json().get("results", [])[:max_results]
                    ]
                    suggestions = ""
                elif name == "serper" and os.getenv("SERPER_API_KEY"):
                    response = await client.post(
                        "https://google.serper.dev/search",
                        headers={"X-API-KEY": os.environ["SERPER_API_KEY"]},
                        json={"q": query, "num": max_results},
                    )
                    response.raise_for_status()
                    items = [
                        {
                            "url": item["link"],
                            "title": item["title"],
                            "snippet": item.get("snippet", "")[:3000],
                            "published": item.get("date"),
                        }
                        for item in response.json().get("organic", [])[:max_results]
                    ]
                    suggestions = ""
                else:
                    continue
                items = [item for item in items if safe_url(item["url"]) and item["snippet"]]
                if items:
                    return {
                        "items": items,
                        "provider": name,
                        "search_suggestions": suggestions,
                        "ms": round((time.perf_counter() - started) * 1000),
                    }
            except (httpx.HTTPError, ValueError, KeyError, IndexError) as error:
                failures.append(
                    {
                        "provider": name,
                        "error_type": type(error).__name__,
                        "http_status": error.response.status_code
                        if isinstance(error, httpx.HTTPStatusError)
                        else None,
                    }
                )
                continue
    return {
        "items": [],
        "provider": "unavailable",
        "search_suggestions": "",
        "ms": round((time.perf_counter() - started) * 1000),
        "failures": failures,
    }


def assign_sources(results):
    sources, excerpts, seen, suggestions = [], {}, {}, []
    for topic, result in results:
        if result["search_suggestions"]:
            suggestions.append(result["search_suggestions"])
        for item in result["items"]:
            url = item["url"]
            if url not in seen:
                id = "s" + str(len(sources) + 1)
                seen[url] = id
                sources.append(
                    {
                        "id": id,
                        "url": url,
                        "title": item["title"][:300],
                        "publisher": urlparse(url).hostname,
                        "published": item["published"],
                        "retrieved": time.time(),
                        "kind": "search_result",
                        "provider": result["provider"],
                    }
                )
            id = seen[url]
            excerpts.setdefault(topic, []).append({"source_id": id, "excerpt": item["snippet"]})
    return sources, excerpts, suggestions
