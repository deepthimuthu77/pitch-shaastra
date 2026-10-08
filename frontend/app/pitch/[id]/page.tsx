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
import { motion, useReducedMotion } from "framer-motion";
import { api, getConfig, post } from "@/lib/api";
import type { Config, Pitch } from "@/lib/types";
import { Avatar, Badge, ErrorBox, Loading, Thinking } from "@/components/ui";
import { VoiceInput, Speak } from "@/components/voice";
import { SpokenPractice } from "@/components/spoken-practice";
import { revealMessage } from "@/lib/reveal-message";
import { TankAtmosphere } from "@/components/tank-atmosphere";

export default function PitchRoom({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const reducedMotion = useReducedMotion();
  const router = useRouter();
  const [pitch, setPitch] = useState<Pitch>();
  const [config, setConfig] = useState<Config>();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(60);
  const [pressure, setPressure] = useState(true);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [reacting, setReacting] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const requestId = useRef("");
  const load = () => {
    api<Pitch>(`/api/pitches/${id}`)
      .then((p) => {
        setPitch(p);
        if (p.status === "finished") router.replace(`/pitch/${id}/deal`);
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
  async function send(spoken?: string) {
    const submittedAnswer = spoken ?? answer;
    if (!submittedAnswer.trim() || !pitch || busy) return;
    setBusy(true);
    setError("");
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      const p = await post<Pitch>("/api/pitch/answer", {
        pitch_id: id,
        answer: submittedAnswer,
        request_id: requestId.current,
      });
      setPitch(p);
      setAnswer("");
      localStorage.removeItem(`pitchgrill-draft-${id}`);
      requestId.current = "";
      setSeconds(60);
      setReacting(true);
      setTimeout(() => setReacting(false), 1800);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(messageId: string, index: number, dismissed: boolean) {
    const reason = window.prompt(
      dismissed
        ? "Why should this flag be restored?"
        : "Why is this flag incorrect? This records your correction; it does not claim external verification.",
    );
    if (!reason?.trim()) return;
    try {
      const p = await post<Pitch>("/api/pitch/flag-review", {
        pitch_id: id,
        message_id: messageId,
        flag_index: index,
        decision: dismissed ? "restore" : "dismiss",
        reason,
      });
      setPitch(p);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function finish() {
    setBusy(true);
    setError("");
    try {
      await post<Pitch>("/api/pitch/finish", { pitch_id: id });
      router.push(`/pitch/${id}/deal`);
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
      <TankAtmosphere quiet={listening || Boolean(speaking) || busy} />
      <div className="room-heading">
        <div>
          <span className="eyebrow">TAKE THE FLOOR</span>
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
      <div className="tank-stakes">
        <span>YOUR ASK</span>
        <strong>
          {new Intl.NumberFormat("en", {
            style: "currency",
            currency: pitch.inputs?.currency || "USD",
            maximumFractionDigits: 0,
          }).format(pitch.funding_ask || 100000)}{" "}
          for {pitch.equity_offered || 10}%
        </strong>
        <span>
          {busy
            ? "The panel is considering your answer"
            : `${config.panel.find((m) => m.id === pitch.next_question.asker)?.name} has the floor`}
        </span>
      </div>
      <div className="investor-panel">
        {config.panel.map((member) => {
          const value = pitch.investor_state[member.id];
          return (
            <motion.div
              layout
              className={`investor-seat ${pitch.next_question.asker === member.id ? "active-investor" : "supporting-investor"} ${busy ? "considering" : ""} seat-${speaking === member.id ? "speaking" : busy ? "thinking" : listening ? "listening" : reacting ? "reacting" : "idle"}`}
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
              <details className="investor-conviction">
                <summary>What wins me over</summary>
                <p>{member.conviction || member.lens}</p>
              </details>
              <small className="seat-state">
                {speaking === member.id
                  ? "Speaking"
                  : busy
                    ? "Thinking"
                    : listening
                      ? "Listening"
                      : reacting
                        ? "Reacting to your answer"
                        : "Ready"}
              </small>
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
              const article = (
                <motion.article
                  key={m.id}
                  id={`message-${m.id}`}
                  initial={{
                    opacity: reducedMotion ? 1 : 0,
                    y: reducedMotion ? 0 : 8,
                  }}
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
                        <Speak
                          text={m.text}
                          investor={member.id}
                          onState={(value) =>
                            setSpeaking(value ? member.id : null)
                          }
                        />
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
                      {m.challenge_message_id && (
                        <a
                          href={`#message-${m.challenge_message_id}`}
                          onClick={() => revealMessage(m.challenge_message_id!)}
                        >
                          {" "}
                          · View challenged message
                        </a>
                      )}
                      {m.challenged_quote && (
                        <blockquote>“{m.challenged_quote}”</blockquote>
                      )}
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
                          {flag.review && (
                            <p>
                              Founder review: {flag.review.decision} ·{" "}
                              {flag.review.reason}
                            </p>
                          )}
                          <button
                            className="text-button"
                            onClick={() =>
                              void review(
                                m.id,
                                i,
                                Boolean(
                                  flag.dismissed ||
                                    flag.review?.decision === "dismiss",
                                ),
                              )
                            }
                          >
                            {flag.dismissed ||
                            flag.review?.decision === "dismiss"
                              ? "Restore flag"
                              : "Challenge this flag"}
                          </button>
                        </details>
                      ))}
                    </div>
                  )}
                </motion.article>
              );
              return member && member.id !== pitch.next_question.asker ? (
                <details
                  className="panel-response"
                  key={m.id}
                  id={`response-${m.id}`}
                >
                  <summary>
                    {member.name} weighs in · expand perspective
                  </summary>
                  {article}
                </details>
              ) : (
                article
              );
            })}
            <div ref={bottom} />
          </div>
          <Thinking busy={busy} meta={pitch.llm_meta} />
          {error && <ErrorBox error={error} />}
          <div className="answer-composer">
            {pitch.deep_dive_focus && (
              <p className="practice-cue">
                Deep dive focus: {pitch.deep_dive_focus.replaceAll("_", " ")}.
                The panel tracks whether your follow-up resolves this gap.
              </p>
            )}
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
                {pressure && (
                  <svg
                    className="timer-ring"
                    viewBox="0 0 40 40"
                    aria-hidden="true"
                  >
                    <circle cx="20" cy="20" r="17" />
                    <circle
                      cx="20"
                      cy="20"
                      r="17"
                      style={{ strokeDashoffset: 107 * (1 - seconds / 60) }}
                    />
                  </svg>
                )}
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
                onClick={() => void send()}
              >
                Send answer <Send size={15} />
              </button>
            </div>
            <small className="field-note">
              Your unsent draft stays in this browser. The timer never
              auto-submits.
            </small>
          </div>
          <SpokenPractice
            pitchId={id}
            question={pitch.next_question.text}
            busy={busy || pitch.answer_count >= 8}
            onAnswer={(text) => {
              setAnswer(text);
              localStorage.setItem(`pitchgrill-draft-${id}`, text);
              return send(text);
            }}
            onListening={setListening}
            onSpeaking={(value) =>
              setSpeaking(value ? pitch.next_question.asker : null)
            }
          />
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
            <h3>Ready to face the verdict?</h3>
            <p>
              Hear who is in, who is out, and whether the panel makes a
              fictional offer. Negotiate first; use your coaching report
              afterward.
            </p>
            <button
              className="button secondary"
              onClick={finish}
              disabled={busy}
            >
              Hear the panel verdict <ArrowRight size={15} />
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
