"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CornerDownLeft,
  Flag,
  Send,
  Timer,
} from "lucide-react";
import { motion } from "framer-motion";
import { api, getConfig, post } from "@/lib/api";
import type { Config, Pitch } from "@/lib/types";
import { Avatar, Badge, ErrorBox, Loading, Thinking } from "@/components/ui";
import { VoiceInput, Speak } from "@/components/voice";

export default function PitchRoom({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [pitch, setPitch] = useState<Pitch>();
  const [config, setConfig] = useState<Config>();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [pressure, setPressure] = useState(true);
  const bottom = useRef<HTMLDivElement>(null);
  const requestId = useRef("");
  const load = () => {
    api<Pitch>(`/api/pitches/${id}`)
      .then((p) => {
        setPitch(p);
        if (p.status === "finished") router.replace(`/pitch/${id}/report`);
      })
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    load();
    getConfig()
      .then(setConfig)
      .catch(() => {});
    setAnswer(localStorage.getItem(`pitchgrill-draft-${id}`) || "");
  }, [id]);
  useEffect(() => {
    if (!pressure || busy || !pitch || pitch.status !== "active") return;
    const interval = setInterval(
      () => setSeconds((s) => Math.max(0, s - 1)),
      1000,
    );
    return () => clearInterval(interval);
  }, [pressure, busy, pitch?.answer_count]);
  useEffect(() => {
    bottom.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "nearest",
    });
  }, [pitch?.messages.length]);
  async function send() {
    if (!answer.trim() || !pitch || busy) return;
    setBusy(true);
    setError("");
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const p = await post<Pitch>("/api/pitch/answer", {
        pitch_id: id,
        answer,
        request_id: requestId.current,
      });
      setPitch(p);
      setAnswer("");
      localStorage.removeItem(`pitchgrill-draft-${id}`);
      requestId.current = "";
      setSeconds(60);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await post<Pitch>("/api/pitch/finish", { pitch_id: id });
      router.push(`/pitch/${id}/report`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  if (!pitch || !config)
    return error ? (
      <ErrorBox error={error} retry={load} />
    ) : (
      <Loading text="Opening the pitch room" />
    );
  const rounds = ["pitch", "qa", "deepdive", "verdict"],
    labels = ["Your pitch", "Rapid-fire Q&A", "Deep dive", "Verdict"],
    current = rounds.indexOf(pitch.round);
  return (
    <div className={`pitch-room difficulty-${pitch.difficulty}`}>
      <div className="room-heading">
        <div>
          <span className="eyebrow">LIVE IN YOUR PRACTICE ROOM</span>
          <h1>{pitch.title}</h1>
          <div className="inline-meta">
            <Badge>
              {pitch.difficulty === "friendly"
                ? "Friendly Angel"
                : pitch.difficulty === "shark"
                  ? "Shark Mode"
                  : "Real VC"}
            </Badge>
            <span>Attempt {pitch.attempt_number}</span>
            <span>{pitch.answer_count} / 6 recommended answers</span>
          </div>
        </div>
        <Link href={`/analysis/${pitch.analysis_id}`} className="button ghost">
          Idea analysis <ArrowRight size={15} />
        </Link>
      </div>
      <div className="investor-panel">
        {config.panel.map((member) => {
          const value = pitch.investor_state[member.id];
          return (
            <motion.div
              layout
              className={`investor-seat ${busy ? "considering" : ""}`}
              key={member.id}
              style={{ "--accent": member.color } as React.CSSProperties}
            >
              <div className="seat-top">
                <Avatar member={member} />
                <Badge
                  tone={value >= 65 ? "green" : value < 30 ? "coral" : "amber"}
                >
                  {value >= 65 ? "Interested" : value < 30 ? "Out" : "Doubtful"}
                </Badge>
              </div>
              <h3>{member.name}</h3>
              <p>{member.role}</p>
              <div className="interest-header">
                <span>INTEREST</span>
                <strong>
                  {value}
                  <small>/100</small>
                </strong>
              </div>
              <div
                className="interest-track"
                role="progressbar"
                aria-label={`${member.name} interest`}
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <motion.span
                  style={{ background: member.color }}
                  animate={{ width: `${value}%` }}
                  initial={false}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
      <ol className="round-track" aria-label="Pitch rounds">
        {labels.map((label, i) => (
          <li
            key={label}
            className={
              i === current ? "current" : i < current ? "complete" : ""
            }
          >
            <span>{i < current ? <Check size={12} /> : i + 1}</span>
            {label}
          </li>
        ))}
      </ol>
      <div className="conversation-layout">
        <section className="conversation">
          <div className="conversation-title">
            <h2>The conversation</h2>
            <span>
              <span className="status-dot" />
              Private session
            </span>
          </div>
          <div
            className="transcript"
            role="log"
            aria-label="Pitch transcript"
            aria-live="polite"
          >
            {pitch.messages.map((m) => {
              const member = config.panel.find((p) => p.id === m.speaker);
              return (
                <motion.article
                  key={m.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`message ${m.speaker === "founder" ? "founder" : "investor"}`}
                  style={{ "--accent": member?.color } as React.CSSProperties}
                >
                  <div className="message-author">
                    {member ? (
                      <>
                        <span
                          className="message-dot"
                          style={{ background: member.color }}
                        />
                        {member.name}
                        <small>{member.role}</small>
                        <Speak text={m.text} investor={member.id} />
                      </>
                    ) : (
                      <>
                        <span className="founder-mark">YOU</span>Your answer
                      </>
                    )}
                  </div>
                  {m.challenges && (
                    <div className="interjection">
                      ↳ Challenges{" "}
                      {config.panel.find((p) => p.id === m.challenges)?.name}
                      &apos;s perspective
                    </div>
                  )}
                  <p>{m.text}</p>
                  {m.flags && m.flags.length > 0 && (
                    <div className="message-flags">
                      {m.flags.map((flag, i) => (
                        <details key={i}>
                          <summary>
                            <Badge
                              tone={flag.flag === "strong" ? "green" : "amber"}
                            >
                              {flag.flag === "strong" ? (
                                <Check size={11} />
                              ) : (
                                <Flag size={11} />
                              )}{" "}
                              {flag.flag.replaceAll("_", " ")}
                            </Badge>
                          </summary>
                          <blockquote>“{flag.quote}”</blockquote>
                          <p>{flag.reason}</p>
                          <small>
                            Practice assessment ·{" "}
                            {Math.round(flag.confidence * 100)}% confidence
                          </small>
                        </details>
                      ))}
                    </div>
                  )}
                </motion.article>
              );
            })}
            <div ref={bottom} />
          </div>
          <Thinking busy={busy} meta={pitch.llm_meta} />
          {error && <ErrorBox error={error} />}
          <div className="answer-composer">
            <div className="question-label">
              <Badge tone="mint">
                {
                  config.panel.find((p) => p.id === pitch.next_question.asker)
                    ?.name
                }{" "}
                asks
              </Badge>
              <span>{pitch.next_question.category.replaceAll("_", " ")}</span>
            </div>
            <h3>{pitch.next_question.text}</h3>
            <textarea
              aria-label="Your answer"
              maxLength={5000}
              rows={4}
              value={answer}
              disabled={busy}
              placeholder="Answer the question directly. State what you know—and what you still need to validate."
              onChange={(e) => {
                setAnswer(e.target.value);
                localStorage.setItem(`pitchgrill-draft-${id}`, e.target.value);
                requestId.current = "";
              }}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <div className="composer-controls">
              <VoiceInput
                onText={(text) => {
                  setAnswer((prior) => (prior + " " + text).trim());
                  requestId.current = "";
                }}
                disabled={busy}
              />
              <label className="pressure-control">
                <input
                  type="checkbox"
                  checked={pressure}
                  onChange={(e) => setPressure(e.target.checked)}
                />
                <Timer size={14} />
                {pressure
                  ? seconds
                    ? `${seconds}s remaining`
                    : "Overtime · take your time"
                  : "Timer off"}
              </label>
              <small>
                <CornerDownLeft size={11} /> Ctrl / ⌘ + Enter
              </small>
              <button
                className="button primary"
                disabled={busy || !answer.trim() || pitch.answer_count >= 8}
                onClick={send}
              >
                Send answer <Send size={15} />
              </button>
            </div>
            <small className="field-note">
              Your unsent draft stays in this browser. The timer never
              auto-submits.
            </small>
          </div>
        </section>
        <aside className="room-notes">
          <div className="note-card">
            <span className="eyebrow">WHAT MAKES A GOOD ANSWER?</span>
            <h3>
              Specific. Honest.
              <br />
              Defensible.
            </h3>
            <ol>
              <li>Answer the question asked.</li>
              <li>Give an example or a bounded number.</li>
              <li>Separate evidence from assumptions.</li>
              <li>Say what you haven&apos;t measured yet.</li>
            </ol>
          </div>
          <div className="note-card">
            <span className="eyebrow">MAKE THE LEARNING STICK</span>
            <h3>Ready for your report?</h3>
            <p>
              Get a six-dimension scorecard, weaknesses quoted from your
              answers, a rewritten pitch and five tough questions to prepare
              for.
            </p>
            <button
              className="button secondary"
              onClick={finish}
              disabled={busy}
            >
              Finish & get feedback <ArrowRight size={15} />
            </button>
            {answer && (
              <small>
                Your current draft is not submitted. Send it before finishing if
                you want it included.
              </small>
            )}
          </div>
          <div className="privacy-small">
            Fictional investors. Practice judgments. No real investment offers.
          </div>
        </aside>
      </div>
    </div>
  );
}
