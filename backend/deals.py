import time

from backend.prompts.investors import PANEL


def offers_for(pitch, report=None):
    ask = pitch.get("funding_ask", 100_000)
    founder_equity = pitch.get("equity_offered", 10)
    offers = []
    decisions = {v["id"]: v["decision"] for v in (report or {}).get("verdicts", [])}
    for index, investor in enumerate(PANEL):
        interest = pitch["investor_state"][investor["id"]]
        if interest < 50 or decisions.get(investor["id"]) == "out":
            continue
        equity = round(min(49, max(founder_equity, founder_equity * (1 + (100 - interest) / 100) + index)), 1)
        offers.append(
            {
                "investor_id": investor["id"],
                "amount": ask,
                "equity_percent": equity,
                "valuation": round(ask / (equity / 100), 2),
                "currency": pitch.get("inputs", {}).get("currency", "USD"),
                "conditions": [
                    "Simulated diligence: substantiate the founder-reported evidence",
                    investor["lens"] + ": resolve the report's outstanding questions",
                ],
                "status": "open",
                "rationale": "Fictional negotiating position based on this investor's interest and lens.",
                "original_amount": ask,
                "original_equity_percent": equity,
            }
        )
    return offers


def negotiate(pitch, investor_id, action, amount=None, equity_percent=None):
    offers = pitch["report"].get("simulated_offers", [])
    if pitch.get("deal_outcome", {}).get("status") in {"accepted", "walked_away"}:
        raise ValueError("The negotiation is complete")
    if action == "walk_away":
        for offer in offers:
            if offer["status"] in {"open", "countered"}:
                offer["status"] = "declined"
        pitch["deal_outcome"] = {"status": "walked_away"}
    else:
        offer = next((row for row in offers if row["investor_id"] == investor_id), None)
        if not offer or offer["status"] not in {"open", "countered"}:
            raise ValueError("This investor has no available offer")
        if action == "accept":
            offer["status"] = "accepted"
            pitch["deal_outcome"] = {
                "status": "accepted",
                "investor_id": investor_id,
                "amount": offer["amount"],
                "equity_percent": offer["equity_percent"],
                "currency": offer["currency"],
                "conditions": offer["conditions"],
            }
            for other in offers:
                if other is not offer and other["status"] in {"open", "countered"}:
                    other["status"] = "withdrawn"
        elif action == "decline":
            offer["status"] = "declined"
        elif action == "counter":
            if amount is None or equity_percent is None:
                raise ValueError("A counteroffer requires an amount and equity percentage")
            rounds = sum(
                row["action"] == "counter" and row["investor_id"] == investor_id
                for row in pitch.get("deal_history", [])
            )
            if rounds >= 4:
                raise ValueError("Four counteroffers per investor are allowed; accept, decline or walk away")
            original_value = offer["original_amount"] / (offer["original_equity_percent"] / 100)
            proposed_value = amount / (equity_percent / 100)
            tolerance = 1.1 + pitch["investor_state"][investor_id] / 500
            if proposed_value <= original_value * tolerance and amount <= offer["original_amount"] * 1.5:
                offer.update(
                    amount=amount,
                    equity_percent=equity_percent,
                    valuation=round(proposed_value, 2),
                    status="countered",
                    rationale="The simulated investor accepts these revised terms, subject to diligence. You can confirm or decline.",
                )
            else:
                offer["rationale"] = (
                    "That valuation or capital request exceeds this investor's simulated limit. The existing offer remains open."
                )
        else:
            raise ValueError("Unknown negotiation action")
        if not any(o["status"] in {"open", "countered", "accepted"} for o in offers):
            pitch["deal_outcome"] = {"status": "walked_away"}
    pitch.setdefault("deal_history", []).append(
        {
            "investor_id": investor_id,
            "action": action,
            "amount": amount,
            "equity_percent": equity_percent,
            "timestamp": time.time(),
        }
    )
    pitch["simulation_phase"] = "debrief" if pitch.get("deal_outcome") else "negotiation"
    return pitch
