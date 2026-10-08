import json
import re


def split_think(raw):
    raw = raw or ""
    return re.sub(r"<think>.*?</think>", "", raw, flags=re.I | re.S).strip()


def extract_json(text):
    text = split_think(text)
    decoder = json.JSONDecoder()
    for index, character in enumerate(text):
        if character == "{":
            try:
                value, _ = decoder.raw_decode(text[index:])
                if isinstance(value, dict):
                    return value
            except json.JSONDecodeError:
                continue
    raise ValueError("No valid JSON object")
