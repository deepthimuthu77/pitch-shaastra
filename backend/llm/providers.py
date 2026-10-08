import os

PROVIDERS = {
    "gemini": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    "groq": "https://api.groq.com/openai/v1/chat/completions",
    "openrouter": "https://openrouter.ai/api/v1/chat/completions",
    "cerebras": "https://api.cerebras.ai/v1/chat/completions",
    "mistral": "https://api.mistral.ai/v1/chat/completions",
}


def chain(tier):
    default = "gemini,groq,openrouter,mistral" if tier == "reason" else "gemini,cerebras,groq"
    return [
        name.strip()
        for name in os.getenv(f"LLM_{tier.upper()}_CHAIN", default).split(",")
        if name.strip() in PROVIDERS
    ]


def provider(name, tier):
    return {
        "url": PROVIDERS[name],
        "key": os.getenv(f"{name.upper()}_API_KEY", ""),
        "model": os.getenv(
            f"{name.upper()}_{tier.upper()}_MODEL", "gemini-2.5-flash" if name == "gemini" else ""
        ),
    }


def reasoning_params(name, effort):
    if name == "openrouter":
        return {"reasoning": {"effort": effort}}
    if name in {"gemini", "groq"}:
        return {"reasoning_effort": effort}
    return {}
