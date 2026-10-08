import math
import re
import time

from backend.analysis.models import CASES, WEDGE_WEIGHTS, annual_value, wedge_score


def market_insights(facts, geography):
    market = [
        f
        for f in facts
        if f.get("topic") == "market"
        and f.get("confidence") in {"high", "medium"}
        and (f.get("geography") or "").casefold() == geography.casefold()
    ]
    pairs = []
    for start in market:
        for end in market:
            if not (start.get("value") and end.get("value") and start.get("year") and end.get("year")):
                continue
            if (
                end["year"] <= start["year"]
                or start["metric"].casefold() != end["metric"].casefold()
                or start["unit"] != end["unit"]
            ):
                continue
            rate = (end["value"] / start["value"]) ** (1 / (end["year"] - start["year"])) - 1
            if not math.isfinite(rate):
                continue
            projected = end["year"] > time.gmtime().tm_year or bool(
                re.search(r"forecast|project|expect|predict", start["note"] + " " + end["note"], re.I)
            )
            pairs.append(
                {
                    "status": "projected" if projected else "observed",
                    "cagr": rate,
                    "period_start": start["year"],
                    "period_end": end["year"],
                    "metric": start["metric"],
                    "unit": start["unit"],
                    "fact_ids": [start["id"], end["id"]],
                    "source_ids": list(dict.fromkeys([start["source_id"], end["source_id"]])),
                    "method": "(end/start)^(1/years)-1; only matching metric, units and geography. Projected endpoints are not observed growth.",
                }
            )
    growth = (
        sorted(pairs, key=lambda p: (p["period_end"], p["period_start"]), reverse=True)[0]
        if pairs
        else {
            "status": "unknown",
            "cagr": None,
            "period_start": None,
            "period_end": None,
            "fact_ids": [],
            "source_ids": [],
            "method": "No comparable dated observations with matching metric, units and geography. No growth rate is inferred.",
        }
    )
    structural = [
        f
        for f in facts
        if re.search(
            r"concentrat|fragment|market share|incumbent|barrier|distribution|supplier|buyer power",
            f.get("metric", "") + " " + f.get("note", ""),
            re.I,
        )
    ]
    observations = [
        {"text": f["note"], "fact_ids": [f["id"]], "source_ids": [f["source_id"]]} for f in structural[:10]
    ]
    return {
        "growth": growth,
        "structure": {
            "status": "sourced" if observations else "unknown",
            "observations": observations,
            "unknowns": [
                "Concentration, entry barriers and buyer/supplier power require primary evidence; missing observations do not imply a fragmented market."
            ],
        },
    }


def feature_matrix(competitors, facts, evidence=None):
    evidence = evidence or {
        "features": ["Core workflow", "Integrations", "Security controls", "Pricing"],
        "cells": [],
    }
    features = list(dict.fromkeys(evidence["features"]))[:8]
    fact_map = {f["id"]: f for f in facts}
    rows = []
    for competitor in competitors:
        cells = []
        for feature in features:
            cell = {"feature": feature, "status": "unknown", "value": None, "fact_ids": [], "source_ids": []}
            for supplied in evidence["cells"]:
                fact = fact_map.get(supplied["fact_id"])
                if supplied["competitor"] != competitor["name"] or supplied["feature"] != feature or not fact:
                    continue
                quote = supplied["evidence_quote"]
                if (
                    quote not in fact["note"]
                    or competitor["name"].casefold() not in fact["note"].casefold()
                    or fact["source_id"] not in competitor.get("source_ids", [])
                ):
                    continue
                # The evidence itself is displayed, preventing unsupported feature paraphrases.
                cell.update(
                    status="supported", value=quote, fact_ids=[fact["id"]], source_ids=[fact["source_id"]]
                )
                break
            cells.append(cell)
        rows.append({"competitor": competitor["name"], "cells": cells})
    return {
        "features": features,
        "rows": rows,
        "method": "Supported cells contain literal cited fact excerpts; unknown means no verified evidence, not feature absence.",
    }


def beachhead(wedge, assumptions, business_model):
    fallback = {"geography": (0.01, 0.03, 0.08), "integration": (0.03, 0.08, 0.15)}.get(
        wedge.get("kind"), (0.02, 0.05, 0.1)
    )
    share = wedge.get("segment_share") or dict(zip(CASES, fallback))
    accounts = {case: assumptions["target_accounts"][case] * share[case] for case in CASES}
    revenue = {
        case: accounts[case]
        * annual_value({key: value[case] for key, value in assumptions.items() if value}, business_model)
        for case in CASES
    }
    return {
        "share": share,
        "accounts": accounts,
        "annual_revenue": revenue,
        "provenance": "planning_hypothesis",
        "rationale": wedge.get(
            "segment_share_rationale",
            "An illustrative slice selected for this wedge type. Edit and validate this wedge-specific share before treating it as a market estimate.",
        ),
        "fact_ids": [],
    }


def stability(wedges, evaluations=None, weights=None):
    weights = weights or WEDGE_WEIGHTS
    ranked = [w["name"] for w in sorted(wedges, key=lambda w: -wedge_score(w["scores"], weights))]
    runs = [{"name": "Original synthesis", "ranking": ranked}]
    if evaluations is None:
        for dimension in weights:
            for multiplier in (0.5, 1.5):
                adjusted = {**weights, dimension: weights[dimension] * multiplier}
                order = sorted(wedges, key=lambda w: -wedge_score(w["scores"], adjusted))
                runs.append(
                    {"name": f"{dimension} weight ×{multiplier}", "ranking": [w["name"] for w in order]}
                )
        method = "Deterministic sensitivity to each subjective score weight; no model calls."
    else:
        names = set(ranked)
        for index, evaluation in enumerate(evaluations):
            items = evaluation["evaluations"]
            if len(items) == len(names) and {item["name"] for item in items} == names:
                runs.append(
                    {
                        "name": f"Independent reassessment {index + 1}",
                        "ranking": [
                            item["name"]
                            for item in sorted(items, key=lambda item: -wedge_score(item["scores"], weights))
                        ],
                    }
                )
        method = (
            "Repeated structured model scoring of the same wedges and evidence; scores remain subjective."
        )
    agreement = sum(run["ranking"][0] == ranked[0] for run in runs) / len(runs)
    evaluated = len(runs) > 1
    return {
        "method": method,
        "evaluations": runs,
        "top_agreement": agreement if evaluated else None,
        "stable": agreement >= 0.8 if evaluated else None,
        "limitations": "Agreement measures ranking repeatability, not business success. Weight sensitivity and model reassessment measure different uncertainties.",
    }
