import difflib
import re
import statistics
import time

AREAS = {
    "traction": (
        "Validate willingness to pay",
        "customer|interview|pilot|paid|retention|users",
        "Run a paid pilot in one customer segment and record participation, repeat use and refusals.",
        "Report the segment, observation period, denominator and actual customer behavior.",
    ),
    "unit_economics": (
        "Test the operating economics",
        "price|cost|margin|charge|acquisition|cac|revenue",
        "Separate price, delivery cost and acquisition cost, then measure each in a small sales experiment.",
        "Show measured versus estimated amounts, their units and the experiment that will replace estimates.",
    ),
    "market": (
        "Bound the reachable market",
        "market|segment|reachable|accounts|buyers|businesses",
        "Count reachable buyers in one geography or channel and multiply by a justified annual spend.",
        "Give a bottom-up calculation, source or counting method, and a reachable first segment.",
    ),
    "competition": (
        "Explain why customers switch",
        "competitor|alternative|currently|today|switch|spreadsheet|manual",
        "Compare your offer with a named current workflow, including doing nothing, and test switching friction.",
        "Show a customer comparison, switching cost and measurable advantage rather than claiming no competition.",
    ),
    "team": (
        "Demonstrate delivery capability",
        "team|experience|built|founder|hire|engineer|expertise",
        "Connect a relevant delivered project to the next milestone and name the missing capability.",
        "Give evidence of relevant execution and a concrete plan for the capability gap.",
    ),
    "moat": (
        "Test a durable advantage",
        "moat|copy|replicate|defensib|exclusive|network|switching|data",
        "Identify what a well-funded competitor could copy and test one advantage that compounds with use.",
        "Separate current advantages from hypotheses and explain a mechanism that gets harder to copy.",
    ),
    "risk_regulation": (
        "Design practical safeguards",
        "privacy|sensitive|data|risk|consent|misuse|regulat|harm",
        "Map sensitive data and misuse scenarios, minimize collection and assign a mitigation owner.",
        "Identify a specific harm, preventive control, failure indicator and response owner.",
    ),
    "go_to_market": (
        "Find a repeatable acquisition path",
        "channel|acquisition|sales|distribution|conversion|experiment|outreach",
        "Run one bounded acquisition experiment and measure exposure, conversion and acquisition cost.",
        "Give the channel, budget or time limit, success threshold and observed conversion denominator.",
    ),
    "funding_use": (
        "Tie funding to a milestone",
        "fund|burn|runway|milestone|budget|cash|raise",
        "Budget the next verifiable milestone and state the expense assumptions and failure condition.",
        "Connect a funding amount, burn and timeline to a measurable milestone without inventing runway.",
    ),
    "product": (
        "Clarify the user workflow",
        "user|workflow|problem|pain|product|helps|save|before|after",
        "Describe one user's before-and-after workflow and test the step your product improves.",
        "Name the user, costly step, alternative and observed improvement.",
    ),
}
DIMENSIONS = {
    "team": ["team"],
    "market": ["market", "go_to_market"],
    "traction": ["traction"],
    "model": ["unit_economics", "funding_use"],
    "defensibility": ["competition", "moat"],
    "clarity": ["product"],
}
RUBRIC = {
    "version": "evidence-anchors-v2",
    "anchors": {
        "directness": {
            "0": "Explicit deflection or unrelated response",
            "50": "Relevant but incomplete response",
            "100": "Addresses the category with a bounded example",
        },
        "specificity": {
            "0": "No bounded detail",
            "50": "Named workflow or concrete example",
            "100": "Quantities with units, scope and timeframe",
        },
        "evidence_strength": {
            "0": "Unsupported assertion",
            "50": "Described learning or planned experiment",
            "100": "Measured result with denominator and period; external verification tracked separately",
        },
    },
    "dimensions": DIMENSIONS,
    "method": "Each dimension averages its category scores; unanswered categories contribute zero. Category scores weight directness 30%, specificity 30%, evidence 40%. Evidence is founder-reported unless independently checked.",
}
UNKNOWN = r"\b(?:not (?:yet )?measured|don['’]t know|do not know|need to validate|haven['’]t measured|have not measured|not sure)\b"


def honest_unknown(text):
    return bool(re.search(UNKNOWN, text, re.I))


def active_flags(message):
    return [f for f in message.get("flags", []) if f.get("review", {}).get("decision") != "dismiss"]


def answer_metrics(text, category, flags):
    relevant = bool(re.search(AREAS[category][1], text, re.I))
    assertions = [
        part
        for part in re.split(r"(?<=[.!?])\s+|;|\bbut\b", text, flags=re.I)
        if not honest_unknown(part)
        and not re.search(
            r"\b(?:if|suppose|hypothetical|hypothetically|would|will|plan to|not|never|haven['’]t|have not|did not|didn['’]t)\b",
            part,
            re.I,
        )
    ]
    substantive = " ".join(assertions)
    numeric = bool(
        re.search(
            r"(?:[$₹]\s*\d+|\b\d+(?:\.\d+)?\s*(?:%|USD|INR|dollars?|rupees?|customers?|owners?|users?|clinics?|accounts?|appointments?|weeks?|months?|years?|days?|per|practitioners?|interviews?|paid))",
            substantive,
            re.I,
        )
    )
    bounded = bool(
        re.search(
            r"\b(?:week|month|year|days?|owners?|people|customers?|accounts?|percent|per|USD|INR)\b|[$₹%]",
            text,
            re.I,
        )
    )
    observed = bool(
        re.search(
            r"\b(?:measured|interviewed|tested|observed|paid|completed|retained|sold)\b", substantive, re.I
        )
    )
    planned = bool(re.search(r"\b(?:will|plan|testing|validate|experiment|pilot)\b", text, re.I))
    unknown = honest_unknown(text)
    direct = 85 if relevant and (numeric or unknown or len(text.split()) >= 18) else 55 if relevant else 25
    if any(f.get("flag") == "dodged" for f in flags):
        direct = 10
    specificity = (
        85 if numeric and bounded and relevant else 55 if relevant and len(text.split()) >= 15 else 25
    )
    evidence = (
        85 if observed and numeric and bounded else 60 if observed else 45 if planned or unknown else 20
    )
    return {
        "question_category": category,
        "directness": direct,
        "specificity": specificity,
        "evidence_strength": evidence,
        "numeric_claims": [],
        "vague_phrases": [f["quote"] for f in flags if f.get("flag") == "vague"],
        "weakness_tags": [category] if direct < 65 or evidence < 65 else [],
    }


def build_tracker(pitch, latest=None, claim_checks=None):
    tracker = {
        key: {
            "attempts": 0,
            "score": 0,
            "resolved": False,
            "latest_message_id": None,
            "evidence": "",
            "gap": AREAS[key][3],
        }
        for key in AREAS
    }
    founder = [m for m in pitch.get("messages", []) if m.get("speaker") == "founder"]
    if latest:
        founder.append(latest)
    for message in founder:
        metric = message.get("metrics") or {}
        category = metric.get("question_category", "product")
        if category not in tracker:
            continue
        categories = [category]
        if message.get("question") == "Opening pitch":
            categories = [
                key for key, area in AREAS.items() if re.search(area[1], message["text"], re.I)
            ] or [category]
        for key in categories:
            flags = active_flags(message)
            values = answer_metrics(message["text"], key, flags)
            score = round(
                values["directness"] * 0.3 + values["specificity"] * 0.3 + values["evidence_strength"] * 0.4
            )
            if any(f.get("flag") in {"vague", "unrealistic", "dodged"} for f in flags):
                score = min(score, 45)
            item = tracker[key]
            item.update(
                attempts=item["attempts"] + 1,
                score=score,
                resolved=score >= 65,
                latest_message_id=message.get("id"),
                evidence=message["text"][:350],
            )
    for claim in claim_checks or []:
        category = {
            "cac": "unit_economics",
            "arpu": "unit_economics",
            "ltv_cac": "unit_economics",
            "revenue": "unit_economics",
            "sam": "market",
            "som": "market",
            "competition": "competition",
        }.get(claim.get("maps_to"))
        if category and claim.get("verdict") == "contradicted":
            item = tracker[category]
            # Assumption ranges measure consistency, not factual truth.
            verified = claim.get("maps_to") == "competition" or claim.get("independently_verified") is True
            item["claim_conflict"] = {
                "quote": claim.get("quote", ""),
                "basis": claim.get("basis", ""),
                "verified": verified,
                "message_id": claim.get("message_id"),
            }
            if verified:
                item.update(score=min(item["score"], 40), resolved=False)
    return tracker


def weakest_area(tracker, practice_category=None):
    if practice_category in tracker and not tracker[practice_category]["resolved"]:
        return practice_category
    answered = [key for key in tracker if tracker[key]["attempts"] and not tracker[key]["resolved"]]
    return (
        min(answered, key=lambda key: (tracker[key]["score"], tracker[key]["attempts"]))
        if answered
        else min(tracker, key=lambda key: (tracker[key]["score"], tracker[key]["attempts"]))
    )


def select_round(pitch, tracker):
    count = pitch.get("answer_count", 0)
    if count >= 6:
        return "verdict"
    covered = sum(item["attempts"] > 0 for item in tracker.values())
    return "deepdive" if count >= 2 and covered >= 2 else "qa"


def practice_question(category):
    if category not in AREAS:
        raise ValueError("Unknown practice category")
    from backend.pitch import question

    result = question(category)
    result["text"] = "Focused practice: " + result["text"]
    result["reason"] = AREAS[category][3]
    return result


def next_category(pitch, tracker):
    focus = weakest_area(tracker, pitch.get("practice_category"))
    if pitch.get("practice_category") in tracker:
        return pitch["practice_category"], focus
    if select_round(pitch, tracker) == "deepdive" and tracker[focus]["attempts"] < 3:
        return focus, focus
    unseen = [key for key in AREAS if not tracker[key]["attempts"]]
    return (unseen[0] if unseen else focus), focus


def apply_flag_review(pitch, message_id, flag_index, decision, reason):
    if decision not in {"dismiss", "restore"} or not reason.strip():
        raise ValueError("A review decision and explanation are required")
    message = next(
        (m for m in pitch.get("messages", []) if m.get("id") == message_id and m.get("speaker") == "founder"),
        None,
    )
    if message is None or flag_index < 0 or flag_index >= len(message.get("flags", [])):
        raise ValueError("Unknown founder message or flag")
    review = {
        "decision": decision,
        "reason": reason[:600],
        "reviewed_at": time.time(),
        "basis": "Founder review; original flag preserved for audit",
    }
    flag = message["flags"][flag_index]
    flag.setdefault("review_history", []).append(review)
    flag["review"] = review
    pitch["weakness_tracker"] = build_tracker(pitch, claim_checks=pitch.get("claim_check"))
    return review


def report_intelligence(pitch, claim_checks=None):
    tracker = build_tracker(pitch, claim_checks=claim_checks)
    scorecard = {
        dimension: round(statistics.mean(tracker[key]["score"] for key in keys))
        for dimension, keys in DIMENSIONS.items()
    }
    coverage = round(100 * sum(item["attempts"] > 0 for item in tracker.values()) / len(tracker))
    score = round(statistics.mean(scorecard.values()))
    priorities = sorted(
        tracker, key=lambda key: (tracker[key]["resolved"], tracker[key]["score"], -tracker[key]["attempts"])
    )
    plans = [
        {
            "category": key,
            "title": AREAS[key][0],
            "evidence": tracker[key]["evidence"] or pitch["idea"][:350],
            "message_id": tracker[key]["latest_message_id"],
            "why_it_matters": "This area remains unresolved: " + AREAS[key][3],
            "action": AREAS[key][2],
            "success_criterion": AREAS[key][3],
            "score": tracker[key]["score"],
            "resolved": tracker[key]["resolved"],
            "coverage_status": "answered" if tracker[key]["attempts"] else "not yet addressed",
        }
        for key in priorities[:5]
    ]
    return {
        "scorecard": scorecard,
        "overall_score": score,
        "rubric": RUBRIC,
        "weakness_tracker": tracker,
        "readiness": {
            "score": score,
            "band": "Evidence-ready practice"
            if score >= 75 and coverage >= 80
            else "Developing"
            if score >= 45
            else "Needs validation",
            "coverage_percent": coverage,
            "method": RUBRIC["method"],
            "limitations": "Practice readiness is not funding probability. Scores use transcript evidence; reviewed flags and independently checked contradictions are distinguished from assumptions.",
        },
        "improvement_plan": plans,
        "targeted_practice": [
            {
                "category": item["category"],
                "question": practice_question(item["category"])["text"],
                "success_criterion": item["success_criterion"],
            }
            for item in plans
        ],
        "interest_trajectory": pitch.get("interest_history", []),
        "claim_checks": claim_checks or [],
        "scoring_origin": "deterministic-rubric-v2",
    }


def readiness(pitch):
    return report_intelligence(pitch, pitch.get("claim_check"))["readiness"]


def enrich_report(pitch, existing_report, claims=None):
    data = dict(existing_report)
    data.update(report_intelligence(pitch, claims if claims is not None else pitch.get("claim_check")))
    data["weaknesses"] = [
        {
            key: item[key]
            for key in ("category", "title", "evidence", "message_id", "why_it_matters", "action")
        }
        for item in data["improvement_plan"][:3]
    ]
    before_words, after_words = pitch["idea"].split(), data.get("rewritten_pitch", "").split()
    changes = []
    for tag, first, last, new_first, new_last in difflib.SequenceMatcher(
        a=before_words, b=after_words, autojunk=False
    ).get_opcodes():
        if tag == "equal":
            continue
        changes.append(
            {
                "category": "structure" if tag == "insert" else "clarity",
                "before": " ".join(before_words[first:last]),
                "after": " ".join(after_words[new_first:new_last]),
                "reason": "Added evidence framing or a validation placeholder; verify that it accurately represents your intended claim."
                if tag == "insert"
                else "Reorganized the original pitch around stated evidence and unresolved questions; review the changed wording.",
            }
        )
    data["rewrite_changes"] = changes[:20]
    data["flag_review_note"] = (
        "Founder dismissals affect practice scoring, not external fact checks; original flags and review history remain available."
    )
    data["unresolved_claims"] = [
        c for c in data["claim_checks"] if c.get("verdict") in {"contradicted", "unverifiable"}
    ]
    data["claim_followups"] = [
        {
            "quote": c.get("quote", ""),
            "message_id": c.get("message_id"),
            "verdict": c.get("verdict"),
            "action": "Reconcile the claim with its cited evidence before including it in the pitch."
            if c.get("verdict") == "contradicted"
            else "Supply a source, measurement period and unit; leave the claim labelled unverified until checked.",
            "basis": c.get("basis", "No independent verification supplied."),
        }
        for c in data["unresolved_claims"]
    ]
    return data


def benchmark_readiness(pitches):
    eligible = [p for p in pitches if p.get("report")]
    if len(eligible) < 2:
        return {
            "available": False,
            "reason": "Complete two attempts to compare your own practice readiness.",
            "sample_size": len(eligible),
        }
    eligible.sort(key=lambda p: p.get("created_at", 0))
    scores = [report_intelligence(p, p.get("claim_check"))["overall_score"] for p in eligible]
    return {
        "available": True,
        "sample_size": len(scores),
        "median": round(statistics.median(scores)),
        "latest": scores[-1],
        "delta_from_first": scores[-1] - scores[0],
        "scope": "Your own completed practice sessions only",
        "synthetic": all(p.get("is_synthetic") for p in eligible),
    }
