"use client";
import { useState } from "react";
import { post } from "@/lib/api";
import type { Config, InvestorId, Pitch } from "@/lib/types";
import { Avatar, Badge, ErrorBox, money } from "./ui";
import { Speak } from "./voice";

export function DealRoom({
  pitch,
  config,
  onChange,
  onSpeaking,
}: {
  pitch: Pitch;
  config: Config;
  onChange(pitch: Pitch): void;
  onSpeaking?: (value: boolean) => void;
}) {
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [counter, setCounter] = useState<InvestorId | null>(null),
    [amount, setAmount] = useState(""),
    [equity, setEquity] = useState("");
  async function negotiate(investor: InvestorId, action: string) {
    setBusy(investor);
    setError("");
    try {
      const updated = await post<Pitch>("/api/pitch/deal", {
        pitch_id: pitch.id,
        investor_id: investor,
        action,
        ...(action === "counter"
          ? { amount: Number(amount), equity_percent: Number(equity) }
          : {}),
      });
      onChange(updated);
      setCounter(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const offers = pitch.report?.simulated_offers;
  if (!offers) return null;
  const accepted = pitch.deal_outcome?.status === "accepted";
  return (
    <section className="card deal-room">
      <span className="eyebrow">THE FINAL NEGOTIATION</span>
      <h2>
        {accepted ? "You have a simulated deal." : "Will you make a deal?"}
      </h2>
      <p>
        Fictional investor offers for negotiation practice. No money, contract
        or real investment is involved. Valuations are illustrative judgments.
      </p>
      {pitch.negotiation_reaction && (
        <div className="deal-reaction" role="status">
          <strong>
            {
              config.panel.find(
                (m) => m.id === pitch.negotiation_reaction?.investor_id,
              )?.name
            }
          </strong>
          <p>{pitch.negotiation_reaction.text}</p>
          <Speak
            text={pitch.negotiation_reaction.text}
            investor={pitch.negotiation_reaction.investor_id}
            onState={onSpeaking}
          />
          <small>
            {pitch.negotiation_reaction.meta.is_demo
              ? "Rules-based dialogue"
              : `Live ${pitch.negotiation_reaction.meta.provider} dialogue`}{" "}
            · simulated terms enforced by the app
          </small>
        </div>
      )}
      {!offers.length && (
        <p>
          The panel did not make an offer. Build the missing evidence and return
          for another attempt.
        </p>
      )}
      <div className="offer-grid">
        {offers.map((offer) => {
          const member = config.panel.find((m) => m.id === offer.investor_id);
          if (!member) return null;
          const active =
            ["open", "countered"].includes(offer.status) && !accepted;
          return (
            <article className="offer-card" key={offer.investor_id}>
              <div className="card-heading">
                <Avatar member={member} size={50} />
                <div>
                  <h3>{member.name}</h3>
                  <Badge
                    tone={
                      offer.status === "accepted"
                        ? "green"
                        : active
                          ? "amber"
                          : "neutral"
                    }
                  >
                    {offer.status}
                  </Badge>
                </div>
              </div>
              <h3>
                {money(offer.amount, offer.currency)} for {offer.equity_percent}
                % equity
              </h3>
              <p>Implied valuation: {money(offer.valuation, offer.currency)}</p>
              <p>{offer.rationale}</p>
              <ul>
                {offer.conditions.map((condition, i) => (
                  <li key={i}>{condition}</li>
                ))}
              </ul>
              {active && (
                <div className="button-row no-print">
                  <button
                    className="button primary"
                    disabled={Boolean(busy)}
                    onClick={() => void negotiate(offer.investor_id, "accept")}
                  >
                    Accept simulated offer
                  </button>
                  <button
                    className="button secondary"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      setCounter(offer.investor_id);
                      setAmount(String(offer.amount));
                      setEquity(String(offer.equity_percent));
                    }}
                  >
                    Counteroffer
                  </button>
                  <button
                    className="button ghost"
                    disabled={Boolean(busy)}
                    onClick={() => void negotiate(offer.investor_id, "decline")}
                  >
                    Decline
                  </button>
                </div>
              )}
              {counter === offer.investor_id && (
                <form
                  className="pivot-form no-print"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void negotiate(offer.investor_id, "counter");
                  }}
                >
                  <label>
                    Investment amount ({offer.currency})
                    <input
                      type="number"
                      min="1"
                      max="1000000000000"
                      required
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                  </label>
                  <label>
                    Equity offered (%)
                    <input
                      type="number"
                      min="0.1"
                      max="49"
                      step="0.1"
                      required
                      value={equity}
                      onChange={(e) => setEquity(e.target.value)}
                    />
                  </label>
                  <button className="button primary" disabled={Boolean(busy)}>
                    Submit counteroffer
                  </button>
                  <button
                    type="button"
                    className="button ghost"
                    onClick={() => setCounter(null)}
                  >
                    Cancel
                  </button>
                </form>
              )}
            </article>
          );
        })}
      </div>
      {Boolean(pitch.deal_history?.length) && (
        <details>
          <summary>Negotiation history</summary>
          {pitch.deal_history?.map((event, i) => (
            <p key={i}>
              {config.panel.find((m) => m.id === event.investor_id)?.name}:{" "}
              {event.action} ·{" "}
              {event.amount?.toLocaleString() ?? "existing terms"} for{" "}
              {event.equity_percent}%
            </p>
          ))}
        </details>
      )}
      {!pitch.deal_outcome && (
        <button
          className="button ghost no-print"
          disabled={Boolean(busy)}
          onClick={() => void negotiate("vc", "walk_away")}
        >
          Walk away from the tank
        </button>
      )}
      {pitch.deal_outcome?.status === "walked_away" && (
        <p>
          You walked away. Review the coaching report before your next attempt.
        </p>
      )}
      {error && <ErrorBox error={error} />}
    </section>
  );
}
