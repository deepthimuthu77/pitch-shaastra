import os
from copy import deepcopy


def output_format(name, model, schema):
    if name != "groq" or model not in {"qwen/qwen3.8-27b", "openai/gpt-oss-20b"}:
        return {"type": "json_object"}
    definition = deepcopy(schema.model_json_schema())
    closed = True

    def prepare(node):
        nonlocal closed
        if isinstance(node, dict):
            node.pop("default", None)
            if node.get("type") == "object":
                if node.get("additionalProperties") not in (None, False):
                    closed = False
                else:
                    node["additionalProperties"] = False
                    node["required"] = list(node.get("properties", {}))
            for value in node.values():
                prepare(value)
        elif isinstance(node, list):
            for value in node:
                prepare(value)

    prepare(definition)
    return {
        "type": "json_schema",
        "json_schema": {"name": schema.__name__, "strict": closed, "schema": definition},
    }


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


def reasoning_params(name, effort, model=""):
    if name == "openrouter":
        return {"reasoning": {"effort": effort}}
    if name == "groq" and model == "qwen/qwen3.8-27b":
        return {"reasoning_effort": effort, "reasoning_format": "hidden"}
    if name == "gemini" or (
        name == "groq" and model in {"openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"}
    ):
        return {"reasoning_effort": effort}
    return {}
