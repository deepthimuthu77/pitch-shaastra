"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import { post } from "@/lib/api";
import type { InvestorId, Meta } from "@/lib/types";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

export function SpokenPractice({
  pitchId,
  question,
  busy,
  onAnswer,
  onListening,
  onSpeaking,
}: {
  pitchId: string;
  question: string;
  busy: boolean;
  onAnswer(text: string): Promise<void>;
  onListening(value: boolean): void;
  onSpeaking(value: boolean): void;
}) {
  const [enabled, setEnabled] = useState(false),
    [supported, setSupported] = useState(false),
    [interjections, setInterjections] = useState(false),
    [caption, setCaption] = useState(""),
    [hint, setHint] = useState(""),
    [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null),
    timeout = useRef<ReturnType<typeof setTimeout> | null>(null),
    generation = useRef(0),
    finalText = useRef(""),
    submitted = useRef(false),
    heardQuestion = useRef(""),
    callback = useRef(onAnswer);
  const [interjection, setInterjection] = useState<{
      text: string;
      asker: InvestorId;
      interruption_kind: string;
      meta: Meta;
    } | null>(null),
    [challenging, setChallenging] = useState(false);
  callback.current = onAnswer;
  useEffect(() => {
    const w = window as unknown as {
      SpeechRecognition?: unknown;
      webkitSpeechRecognition?: unknown;
    };
    setSupported(Boolean(w.SpeechRecognition || w.webkitSpeechRecognition));
    return () => {
      generation.current++;
      recognition.current?.abort();
      if (timeout.current) clearTimeout(timeout.current);
      window.speechSynthesis?.cancel();
    };
  }, []);
  function cancelAudio() {
    window.dispatchEvent(new Event("pitchgrill-barge-in"));
    window.speechSynthesis?.cancel();
    onSpeaking(false);
  }
  function stop() {
    generation.current++;
    recognition.current?.abort();
    if (timeout.current) clearTimeout(timeout.current);
    cancelAudio();
    onListening(false);
    setEnabled(false);
  }
  function listen(current: number) {
    if (current !== generation.current) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) return;
    recognition.current?.abort();
    const r = new Constructor();
    recognition.current = r;
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    finalText.current = "";
    submitted.current = false;
    setCaption("");
    setHint("");
    const started = Date.now();
    let challenged = false;
    setInterjection(null);
    async function submit() {
      const text = finalText.current.trim();
      if (!text || submitted.current || current !== generation.current) return;
      submitted.current = true;
      r.abort();
      onListening(false);
      await callback.current(text);
    }
    r.onresult = (event) => {
      if (current !== generation.current || submitted.current) return;
      let final = "",
        interim = "";
      for (const item of Array.from(event.results)) {
        if (item.isFinal) final += item[0].transcript + " ";
        else interim += item[0].transcript + " ";
      }
      finalText.current = final;
      setCaption(final + interim);
      if (
        interjections &&
        !challenged &&
        Date.now() - started > 12000 &&
        (final + interim).split(/\s+/).length >= 35
      ) {
        challenged = true;
        setChallenging(true);
        void post<{
          text: string;
          asker: InvestorId;
          interruption_kind: string;
          meta: Meta;
        }>("/api/pitch/interject", {
          pitch_id: pitchId,
          partial_answer: (final + interim).trim().slice(0, 5000),
          request_id: crypto.randomUUID(),
        })
          .then((result) => {
            if (current === generation.current) setInterjection(result);
          })
          .catch((e) => {
            if (current === generation.current)
              setHint(
                `Interjection unavailable: ${(e as Error).message}. Keep answering; your transcript is preserved.`,
              );
          })
          .finally(() => setChallenging(false));
      }
      if (timeout.current) clearTimeout(timeout.current);
      if (final.trim() && !interim.trim())
        timeout.current = setTimeout(() => void submit(), 1800);
    };
    r.onerror = (event) => {
      if (current !== generation.current || event.error === "aborted") return;
      setError(
        `Speech recognition: ${event.error}. Your typed answer remains available.`,
      );
      stop();
    };
    r.onend = () => {
      if (current !== generation.current || submitted.current) return;
      onListening(false);
      if (finalText.current.trim()) void submit();
      else {
        setError(
          "The microphone stopped before a final transcript. Restart spoken practice or type your answer.",
        );
        setEnabled(false);
      }
    };
    try {
      r.start();
      onListening(true);
    } catch {
      setError(
        "Microphone could not start. Use the typed answer or try again.",
      );
      stop();
    }
  }
  useEffect(() => {
    if (!enabled || busy) {
      generation.current++;
      recognition.current?.abort();
      onListening(false);
      return;
    }
    const current = ++generation.current;
    if (heardQuestion.current !== question && "speechSynthesis" in window) {
      heardQuestion.current = question;
      cancelAudio();
      const u = new SpeechSynthesisUtterance(question);
      u.onstart = () => onSpeaking(true);
      u.onend = () => {
        onSpeaking(false);
        listen(current);
      };
      u.onerror = () => {
        onSpeaking(false);
        listen(current);
      };
      window.speechSynthesis.speak(u);
    } else listen(current);
    return () => {
      generation.current++;
      recognition.current?.abort();
      if (timeout.current) clearTimeout(timeout.current);
      cancelAudio();
      onListening(false);
    };
  }, [enabled, busy, question]);
  return (
    <section className="spoken-practice" aria-label="Spoken practice controls">
      <div className="button-row">
        <button
          type="button"
          className={`button ${enabled ? "secondary" : "ghost"}`}
          disabled={!supported}
          aria-pressed={enabled}
          onClick={() => {
            setError("");
            if (enabled) stop();
            else setEnabled(true);
          }}
        >
          {enabled ? <Square size={14} /> : <Mic size={14} />}{" "}
          {enabled ? "Stop spoken practice" : "Start spoken practice"}
        </button>
        {enabled && (
          <button
            type="button"
            className="button ghost"
            disabled={busy}
            onClick={() => {
              const current = ++generation.current;
              cancelAudio();
              listen(current);
            }}
          >
            Interrupt voice & answer
          </button>
        )}
      </div>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={interjections}
          onChange={(e) => setInterjections(e.target.checked)}
          disabled={enabled}
        />
        Allow investor interjections on my partial answer
      </label>
      <small>
        Spoken mode reads each question and automatically submits a finalized
        transcript after 1.8 seconds of silence. Browser speech may use its own
        service. Optional interjections assess partial answers; final scoring
        uses only submitted answers.
      </small>
      {!supported && (
        <small>
          Continuous speech is unavailable in this browser. Typing and manual
          dictation remain available.
        </small>
      )}
      {caption && (
        <p className="live-caption" aria-live="polite">
          {caption}
        </p>
      )}
      {challenging && (
        <p role="status">The panel is reviewing your partial answer…</p>
      )}
      {interjection && (
        <aside className="practice-cue" aria-live="polite">
          <strong>
            {interjection.asker} interrupts ·{" "}
            {interjection.interruption_kind === "live_model"
              ? "AI assessment"
              : "Offline rule-based cue"}
          </strong>
          <p>{interjection.text}</p>
          <small>
            The microphone stays open. No generated audio is played into your
            transcript.
          </small>
        </aside>
      )}
      {hint && (
        <p role="status" className="practice-cue">
          {hint}
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
