import json
import re
import time
import uuid

from backend.analysis.models import grounded
from backend.coaching import (
    AREAS,
    answer_metrics,
    build_tracker,
    enrich_report,
    next_category,
    report_intelligence,
    select_round,
)
from backend.config import settings
from backend.llm.client import call_llm
from backend.llm.schemas import AskResult, FinishResult
from backend.prompts.investors import FINISH_PROMPT, PANEL, panel_prompt

QUESTIONS = {
    "traction": (
        "customer",
        "Who is the paying customer, and what did your most recent customer conversation reveal?",
    ),
    "unit_economics": (
        "operator",
        "What do you charge per month, what does it cost to deliver, and how will you measure customer acquisition cost?",
    ),
    "market": (
        "vc",
        "How many reachable paying customers are in your first segment? Walk me through a bottom-up estimate.",
    ),
    "risk_regulation": (
        "impact",
        "What sensitive data do you collect, what is the biggest misuse risk, and how will you prevent it?",
    ),
    "competition": (
        "vc",
        "What do customers use today, and why would they switch to you? Include the cost of doing nothing.",
    ),
    "team": (
        "operator",
        "Why is your team equipped to deliver this, and what capability would you hire for first?",
    ),
    "go_to_market": (
        "customer",
        "Describe your first repeatable acquisition channel and a small experiment to test willingness to pay.",
    ),
    "funding_use": (
        "operator",
        "What milestone will the next funding round buy, and what is the monthly burn to reach it?",
    ),
    "moat": (
        "vc",
        "What would a funded competitor need to copy, and what becomes harder to replicate as you grow?",
    ),
    "product": (
        "customer",
        "Tell me about the user's workflow before and after using your product. Which step improves?",
    ),
}


def question(category):
    asker, text = QUESTIONS[category]
    return {
        "asker": asker,
        "text": text,
        "targets_weakness": category.replace("_", " "),
        "category": category,
    }


def demo_meta(started):
    return {
        "provider": "demo",
        "model": "transparent-rules-v1",
        "ms": round((time.perf_counter() - started) * 1000),
        "reasoning_tokens": None,
        "is_demo": True,
        "degraded": False,
        "tier": "rules",
        "summary": "Local heuristic coaching. No AI model was called; these are practice signals, not verified judgments.",
    }


def demo_ask(pitch, answer):
    category = (pitch.get("next_question") or {}).get("category", "product")
    flags = []
    honest_unknown = bool(
        re.search(
            r"\b(?:not (?:yet )?measured|don't know|do not know|need to validate|haven't measured|have not measured)\b",
            answer,
            re.I,
        )
    )
    for phrase in ("huge market", "no competitors", "everyone needs this", "guaranteed success"):
        match = re.search(r"\b" + re.escape(phrase) + r"\b", answer, re.I)
        if match:
            prefix = answer[max(0, match.start() - 120) : match.start()]
            if not re.search(
                r"(?:not|never|don't|do not|avoid|example|hypothetical|rather than|if)\b", prefix, re.I
            ):
                flags.append(
                    {
                        "flag": "vague",
                        "quote": match[0],
                        "reason": "This claim needs a bounded segment or evidence. It is not evidence of dishonesty.",
                        "confidence": 0.9,
                    }
                )
    dodge = re.search(
        r"(?:let['’]s move on|I (?:won't|will not) answer|(?:costs|numbers|customers) (?:don't|do not) matter)",
        answer,
        re.I,
    )
    if dodge:
        flags.append(
            {
                "flag": "dodged",
                "quote": dodge[0],
                "reason": "This explicitly deflects the current question.",
                "confidence": 0.95,
            }
        )
    has_numbers = bool(re.search(r"\d", answer))
    if category in {"market", "unit_economics", "funding_use"} and not has_numbers and not honest_unknown:
        flags.append(
            {
                "flag": "no_numbers",
                "quote": answer[:150],
                "reason": "The question asked for quantities; you can also say what is not measured yet.",
                "confidence": 0.85,
            }
        )
    impossible = re.search(r"(\d+(?:\.\d+)?)\s*%\s*(?:conversion|churn|market share)", answer, re.I)
    if impossible and float(impossible[1]) > 100:
        flags.append(
            {
                "flag": "unrealistic",
                "quote": impossible[0],
                "reason": "A share or proportion cannot exceed the whole.",
                "confidence": 0.99,
            }
        )
    evidence = bool(
        re.search(r"\b(?:interview|pilot|paid|tested|measured|experiment|customer|users)\b", answer, re.I)
    )
    measured_metrics = answer_metrics(answer, category, flags)
    if measured_metrics["evidence_strength"] >= 80 and measured_metrics["specificity"] >= 80 and not flags:
        flags.append(
            {
                "flag": "strong",
                "quote": answer[:150],
                "reason": "A concrete example with a measurable result; still founder-reported.",
                "confidence": 0.85,
            }
        )
    penalty = sum(7 if f["flag"] != "strong" else -8 for f in flags)
    harshness = {"friendly": 0, "vc": 2, "shark": 4}[pitch["difficulty"]]
    states = pitch.get("investor_state", {p["id"]: 55 for p in PANEL})
    reactions = {
        "vc": "Your reachable segment matters more than a headline market. Show me the route from evidence to scale."
        if flags
        else "The segment is getting clearer. I still want to know what prevents a competitor from copying the approach.",
        "operator": "Let's turn that into a testable operating plan: price, delivery cost, acquisition cost, and the next milestone."
        if not has_numbers
        else "Those numbers give us something to test. Separate measured costs from estimates and tell me the next operating milestone.",
        "customer": "I disagree with Alex: learning from a real customer can be valuable before a large market estimate. What did a customer actually do?"
        if not evidence
        else "You have a customer story to work with. What behavior shows willingness to pay rather than polite interest?",
        "impact": "Customer interest is useful, Jamie, but it does not remove privacy or misuse risk. Who could be harmed and what would you change?",
    }
    next_category = (
        category
        if any(f["flag"] == "dodged" for f in flags)
        else [
            "traction",
            "unit_economics",
            "market",
            "risk_regulation",
            "competition",
            "team",
            "go_to_market",
            "funding_use",
            "moat",
        ][min(pitch.get("answer_count", 0) + (1 if pitch.get("messages") else 0), 8)]
    )
    if any(f["flag"] == "vague" for f in flags):
        next_category = "competition" if "no competitors" in answer.lower() else "market"
    next_q = question(next_category)
    if next_category == category and pitch.get("next_question"):
        next_q["text"] = "Let me be precise: " + next_q["text"]
    return AskResult.model_validate(
        {
            "analysis": "The local rules inspect explicit claims, quantified examples and direct deflections. Unmeasured facts are treated as gaps rather than proof of failure.",
            "flags": flags[:5],
            "answer_metrics": answer_metrics(answer, category, flags),
            "investors": [
                {
                    "id": p["id"],
                    "reaction": reactions[p["id"]],
                    "interest": max(
                        0,
                        min(
                            100,
                            states[p["id"]]
                            + max(
                                -15,
                                min(
                                    15,
                                    (5 if evidence else -2)
                                    - penalty
                                    - harshness
                                    + (3 if p["id"] == "customer" and evidence else 0),
                                ),
                            ),
                        ),
                    ),
                    "status": "doubtful",
                    "challenges": "vc"
                    if p["id"] == "customer"
                    else "customer"
                    if p["id"] == "impact"
                    else None,
                }
                for p in PANEL
            ],
            "next_question": next_q,
        }
    )


def gate_flags(result, answer, question_category):
    accepted = []
    for flag in result.flags:
        if flag.quote not in answer or flag.confidence < 0.8:
            continue
        if flag.flag in {"vague", "unrealistic"}:
            before = answer[max(0, answer.find(flag.quote) - 120) : answer.find(flag.quote)]
            if re.search(
                r"\b(?:not|never|don't|do not|avoid|example|hypothetical|rather than|if)\b", before, re.I
            ):
                continue
        position = answer.find(flag.quote)
        prefix = answer[max(0, position - 70) : position]
        if flag.flag in {"vague", "unrealistic", "strong"} and re.search(
            r"\b(?:not|never|don['’]t|do not|hypothetically|hypothetical|suppose|if|quote|claim|said|rather than)\b",
            prefix,
            re.I,
        ):
            continue
        if flag.flag == "no_numbers" and question_category not in {"market", "unit_economics", "funding_use"}:
            continue
        if flag.flag == "no_numbers" and re.search(
            r"not (?:yet )?measured|don't know|do not know|need to validate", answer, re.I
        ):
            continue
        accepted.append(flag)
    result.flags = accepted
    return result


def ground_challenges(reactions, messages):
    for reaction in reactions:
        target = reaction.get("challenges")
        candidates = [m for m in messages if m.get("speaker") == target]
        if target == reaction["id"] or not candidates:
            reaction.update(challenges=None, challenge_message_id=None, challenged_quote=None)
            continue
        referenced = next(
            (m for m in candidates if m.get("id") == reaction.get("challenge_message_id")),
            candidates[-1],
        )
        quote = reaction.get("challenged_quote")
        reaction["challenge_message_id"] = referenced["id"]
        reaction["challenged_quote"] = (
            quote if quote and quote in referenced["text"] else referenced["text"][:350]
        )


async def ask_investors(pitch, answer, grounding=None):
    started = time.perf_counter()
    if settings().app_mode == "demo":
        result, meta = demo_ask(pitch, answer), demo_meta(started)
    else:
        out = await call_llm(
            system=panel_prompt(pitch["difficulty"]),
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "idea": pitch["idea"],
                            "funding_ask": pitch.get("funding_ask"),
                            "equity_offered": pitch.get("equity_offered"),
                            "currency": pitch.get("inputs", {}).get("currency", "USD"),
                            "round": pitch["round"],
                            "last_question": pitch.get("next_question"),
                            "transcript": [
                                {k: m[k] for k in ("id", "speaker", "text") if k in m}
                                for m in pitch["messages"][-30:]
                            ],
                            "latest_answer": answer,
                            "investor_state": pitch["investor_state"],
                            "research": {
                                k: grounding[k]
                                for k in ("facts", "competitors", "claim_check", "warnings")
                                if k in grounding
                            }
                            if grounding
                            else None,
                            "weakness_tracker": build_tracker(pitch),
                            "practice_category": pitch.get("practice_category"),
                        }
                    ),
                }
            ],
            schema=AskResult,
            effort="high" if pitch["round"] == "deepdive" else "medium",
            max_tokens=2600,
        )
        result, meta = out["data"], out["meta"]
    gate_flags(result, answer, (pitch.get("next_question") or {}).get("category", "product"))
    for investor in result.investors:
        previous = pitch["investor_state"].get(investor.id, 55)
        investor.interest = max(previous - 15, min(previous + 15, investor.interest))
        investor.status = (
            "interested" if investor.interest >= 65 else "out" if investor.interest < 30 else "doubtful"
        )
    data = result.model_dump()
    latest = {
        "id": None,
        "speaker": "founder",
        "text": answer,
        "flags": data["flags"],
        "metrics": data["answer_metrics"],
        "question": pitch.get("next_question", {}).get("text", "Opening pitch"),
    }
    tracker = build_tracker(pitch, latest, (grounding or {}).get("claim_check", pitch.get("claim_check", [])))
    chosen, focus = next_category(pitch, tracker)
    prior_questions = {
        m.get("question", "") for m in pitch.get("messages", []) if m.get("speaker") == "founder"
    }
    proposed = data["next_question"]
    if proposed["category"] != chosen or proposed["text"] in prior_questions:
        proposed = question(chosen)
        if tracker[chosen]["attempts"]:
            proposed["text"] = (
                f"Follow-up {tracker[chosen]['attempts']}: {AREAS[chosen][3]} What evidence or validation plan addresses this gap?"
            )
    proposed["reason"] = (
        f"{AREAS[chosen][0]}: category score {tracker[chosen]['score']}/100; " + AREAS[chosen][3]
    )
    proposed["context_message_id"] = tracker[chosen]["latest_message_id"]
    data.update(
        next_question=proposed,
        weakness_tracker=tracker,
        deep_dive_focus=focus,
        suggested_round=select_round(pitch, tracker),
        trajectory_point={
            "answer_index": pitch.get("answer_count", 0) + (1 if pitch.get("messages") else 0),
            "message_id": None,
            "interest": {i.id: i.interest for i in result.investors},
            "timestamp": time.time(),
        },
    )
    ground_challenges(data["investors"], pitch.get("messages", []))
    return data, meta


def demo_finish(pitch, claim_checks=None):
    founder = [m for m in pitch["messages"] if m["speaker"] == "founder"]
    intelligence = report_intelligence(pitch, claim_checks)
    score = intelligence["scorecard"]
    plans = intelligence["improvement_plan"]
    conflicted = {
        c.get("message_id")
        for c in claim_checks or []
        if c.get("verdict") == "contradicted"
        and (c.get("maps_to") == "competition" or c.get("independently_verified"))
    }
    evidence_sections = [m["text"][:220] for m in founder[-3:] if m.get("id") not in conflicted]
    if not evidence_sections:
        evidence_sections = ["[validate: reconcile the disputed statements before presenting them as facts]"]
    return FinishResult.model_validate(
        {
            "analysis": "This report uses transparent local heuristics. The founder supplied the quoted statements; missing validation is presented as an action, not a discovered fact.",
            "scorecard": score,
            "weaknesses": [
                {
                    key: item[key]
                    for key in ("title", "evidence", "action", "category", "message_id", "why_it_matters")
                }
                for item in plans[:3]
            ],
            "verdicts": [
                {
                    "id": p["id"],
                    "decision": "conditional" if pitch["investor_state"][p["id"]] >= 40 else "out",
                    "reason": p["lens"]
                    + ". I would need bounded evidence and a small validation milestone before considering an investment.",
                }
                for p in PANEL
            ],
            "rewritten_pitch": "Founder statements awaiting verification: "
            + " ".join(evidence_sections)
            + " Next validation milestones: "
            + " ".join("[validate: " + item["success_criterion"] + "]" for item in plans[:3]),
            "prep_sheet": [
                {
                    "question": question(item["category"])["text"],
                    "suggested_answer": "Known founder statement: "
                    + item["evidence"][:250]
                    + " Clearly state what remains unmeasured. "
                    + item["action"]
                    + " Success criterion: "
                    + item["success_criterion"],
                }
                for item in plans[:5]
            ],
        }
    )


async def finish_pitch(pitch, grounding=None, claim_checks=None):
    started = time.perf_counter()
    if settings().app_mode == "demo":
        result, meta = demo_finish(pitch, claim_checks), demo_meta(started)
    else:
        out = await call_llm(
            system=FINISH_PROMPT,
            messages=[
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "pitch": {
                                k: pitch[k]
                                for k in (
                                    "idea",
                                    "funding_ask",
                                    "equity_offered",
                                    "investor_state",
                                    "difficulty",
                                )
                            },
                            "transcript": [
                                {k: m[k] for k in ("id", "speaker", "text") if k in m}
                                for m in pitch["messages"]
                            ],
                            "research": {
                                k: grounding.get("sections", {}).get(k) for k in ("facts", "competitors")
                            }
                            if grounding
                            else None,
                            "claim_checks": claim_checks or [],
                            "rubric": {
                                k: v
                                for k, v in report_intelligence(pitch, claim_checks).items()
                                if k in {"scorecard", "scoring_anchors"}
                            },
                        }
                    ),
                }
            ],
            schema=FinishResult,
            effort="high",
            max_tokens=4000,
        )
        result, meta = out["data"], out["meta"]
    founder_text = "\n".join(m["text"] for m in pitch["messages"] if m["speaker"] == "founder")
    contradicted_quotes = [
        c.get("quote", "")
        for c in claim_checks or []
        if c.get("verdict") == "contradicted"
        and (c.get("maps_to") == "competition" or c.get("independently_verified"))
    ]
    if not grounded(result.rewritten_pitch, founder_text + pitch["idea"]):
        result.rewritten_pitch = demo_finish(pitch, claim_checks).rewritten_pitch
    if any(quote and quote.casefold() in result.rewritten_pitch.casefold() for quote in contradicted_quotes):
        result.rewritten_pitch = demo_finish(pitch, claim_checks).rewritten_pitch
    for item in result.prep_sheet:
        if not grounded(item.suggested_answer, founder_text + pitch["idea"]) or any(
            quote and quote.casefold() in item.suggested_answer.casefold() for quote in contradicted_quotes
        ):
            item.suggested_answer = "State your own measured evidence and clearly label assumptions. The generated answer contained an unsupported number and was withheld."
    for weakness in result.weaknesses:
        if weakness.evidence not in founder_text:
            weakness.evidence = pitch["idea"][:250]
            weakness.action = (
                "The generated evidence quote could not be validated. Review this point manually before using it. "
                + weakness.action[:400]
            )
    data = result.model_dump()
    data["dodged"] = [
        {"question": m.get("question", ""), "answer": m["text"], "message_id": m["id"]}
        for m in pitch["messages"]
        if m["speaker"] == "founder"
        and any(
            f["flag"] == "dodged" and f.get("review", {}).get("decision") != "dismiss"
            for f in m.get("flags", [])
        )
    ]
    data["model_scorecard"] = data["scorecard"]
    return enrich_report(pitch, data, claim_checks), meta


def message(speaker, text, **extras):
    return {"id": uuid.uuid4().hex, "speaker": speaker, "text": text, "timestamp": time.time(), **extras}
