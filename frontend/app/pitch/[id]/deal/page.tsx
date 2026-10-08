"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { api, getConfig } from "@/lib/api";
import type { Config, Pitch } from "@/lib/types";
import { Avatar, Badge, ErrorBox, Loading } from "@/components/ui";
import { DealRoom } from "@/components/deal-room";
import { Speak } from "@/components/voice";
import { TankAtmosphere } from "@/components/tank-atmosphere";

export default function VerdictRoom({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params),
    [pitch, setPitch] = useState<Pitch>(),
    [config, setConfig] = useState<Config>(),
    [error, setError] = useState("");
  const reduced = useReducedMotion();
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    void Promise.all([api<Pitch>(`/api/pitches/${id}`), getConfig()])
      .then(([p, c]) => {
        setPitch(p);
        setConfig(c);
      })
      .catch((e) => setError(e.message));
  }, [id]);
  if (error) return <ErrorBox error={error} />;
  if (!pitch || !config)
    return <Loading text="The panel is ready to deliver its verdict" />;
  if (!pitch.report)
    return (
      <section className="empty-state">
        <h1>Your pitch is still live.</h1>
        <Link href={`/pitch/${id}`} className="button primary">
          Return to the panel
        </Link>
      </section>
    );
  return (
    <div className="negotiation-room">
      <TankAtmosphere quiet={speaking} />
      <div className="page-heading">
        <div>
          <span className="eyebrow">THE MOMENT OF TRUTH</span>
          <h1>Who is in? Who is out?</h1>
          <p>
            {pitch.title} · Attempt {pitch.attempt_number} · Fictional investor
            panel
          </p>
        </div>
        <Badge tone="amber">Simulation · no real money</Badge>
      </div>
      <section className="verdict-grid">
        {pitch.report.verdicts.map((v, i) => {
          const member = config.panel.find((m) => m.id === v.id);
          return (
            member && (
              <motion.article
                className={`card verdict-seat decision-${v.decision}`}
                key={v.id}
                initial={{ opacity: reduced ? 1 : 0, y: reduced ? 0 : 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: reduced ? 0 : i * 0.2 }}
              >
                <Avatar member={member} />
                <h2>{member.name}</h2>
                <Badge
                  tone={
                    v.decision === "in"
                      ? "green"
                      : v.decision === "out"
                        ? "coral"
                        : "amber"
                  }
                >
                  {v.decision === "in"
                    ? "I'm in"
                    : v.decision === "out"
                      ? "I'm out"
                      : "Show me more evidence"}
                </Badge>
                <p>{v.reason}</p>
                <Speak
                  text={`${v.decision === "out" ? "I'm out." : v.decision === "in" ? "I'm in." : "I need more evidence."} ${v.reason}`}
                  investor={v.id}
                  onState={setSpeaking}
                />
              </motion.article>
            )
          );
        })}
      </section>
      <DealRoom
        pitch={pitch}
        config={config}
        onChange={setPitch}
        onSpeaking={setSpeaking}
      />
      <section className="next-step-banner">
        <div>
          <span className="eyebrow">AFTER THE TANK</span>
          <h2>Turn this round into a stronger next pitch.</h2>
          <p>
            Accept, counter, decline or walk away. Your private coaching report
            helps you address the panel&apos;s objections.
          </p>
        </div>
        <Link className="button primary" href={`/pitch/${id}/report`}>
          Open coaching report
        </Link>
      </section>
    </div>
  );
}
