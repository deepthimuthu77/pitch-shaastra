"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Square, Volume2 } from "lucide-react";
import { audioRequest, getConfig } from "@/lib/api";
import type { InvestorId } from "@/lib/types";

type Recognition = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult:
    | ((event: {
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function useCloudVoice() {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    getConfig()
      .then((c) =>
        setAvailable(
          c.mode === "live" &&
            c.services.some(
              (s) => s.name === "Cloud Speech-to-Text" && s.configured,
            ),
        ),
      )
      .catch(() => {});
  }, []);
  return available;
}

export function VoiceInput({
  onText,
  disabled,
}: {
  onText: (text: string) => void;
  disabled: boolean;
}) {
  const [listening, setListening] = useState(false),
    [error, setError] = useState(""),
    [caption, setCaption] = useState(""),
    [cloud, setCloud] = useState(false),
    [transcribing, setTranscribing] = useState(false);
  const available = useCloudVoice();
  const canvas = useRef<HTMLCanvasElement>(null),
    recognizer = useRef<Recognition | null>(null),
    recorder = useRef<MediaRecorder | null>(null),
    cleanup = useRef<() => void>(() => {}),
    generation = useRef(0),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current++;
      recognizer.current?.stop();
      if (recorder.current?.state === "recording") recorder.current.stop();
      cleanup.current();
    };
  }, []);
  async function toggle() {
    if (listening) {
      recognizer.current?.stop();
      if (recorder.current?.state === "recording") recorder.current.stop();
      generation.current++;
      cleanup.current();
      setListening(false);
      return;
    }
    setError("");
    setCaption("");
    const current = ++generation.current;
    if (cloud) {
      if (
        !window.MediaRecorder ||
        !MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ) {
        setError(
          "WebM recording is unavailable. Choose browser speech or type.",
        );
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        if (current !== generation.current || !mounted.current) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const recording = new MediaRecorder(stream, {
          mimeType: "audio/webm;codecs=opus",
        });
        recorder.current = recording;
        const chunks: Blob[] = [];
        recording.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        const timeout = setTimeout(() => {
          if (recording.state === "recording") recording.stop();
        }, 45000);
        cleanup.current = () => {
          clearTimeout(timeout);
          stream.getTracks().forEach((t) => t.stop());
        };
        recording.onstop = () => {
          cleanup.current();
          if (!mounted.current) return;
          setListening(false);
          setTranscribing(true);
          setCaption("Transcribing with Google…");
          void audioRequest(
            "/api/voice/transcribe",
            new Blob(chunks, { type: "audio/webm" }),
          )
            .then((r) => r.json())
            .then((result) => {
              if (!mounted.current) return;
              setCaption(result.text || "No speech detected.");
              if (result.text) onText(result.text);
            })
            .catch((e) => {
              if (mounted.current) {
                setCaption("");
                setError(e.message);
              }
            })
            .finally(() => {
              if (mounted.current) setTranscribing(false);
            });
        };
        recording.start();
        setListening(true);
      } catch {
        setError("Microphone permission is unavailable. Continue typing.");
        cleanup.current();
      }
      return;
    }
    const constructors = window as unknown as {
      SpeechRecognition?: new () => Recognition;
      webkitSpeechRecognition?: new () => Recognition;
    };
    const Constructor =
      constructors.SpeechRecognition || constructors.webkitSpeechRecognition;
    if (!Constructor) {
      setError(
        "Browser speech recognition is unavailable. Typing always works; try Chrome or Edge.",
      );
      return;
    }
    const recognition = new Constructor();
    recognizer.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++)
        text += event.results[i][0].transcript;
      setCaption(text);
      if (event.results[event.results.length - 1].isFinal) onText(text);
    };
    recognition.onerror = (event) => {
      generation.current++;
      setError(`Microphone: ${event.error}. Continue typing.`);
      setListening(false);
      cleanup.current();
    };
    recognition.onend = () => {
      generation.current++;
      setListening(false);
      cleanup.current();
    };
    try {
      recognition.start();
      setListening(true);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (current !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const context = new AudioContext(),
        analyser = context.createAnalyser();
      analyser.fftSize = 128;
      context.createMediaStreamSource(stream).connect(analyser);
      const samples = new Uint8Array(analyser.frequencyBinCount);
      let frame = 0;
      const draw = () => {
        analyser.getByteFrequencyData(samples);
        const c = canvas.current,
          ctx = c?.getContext("2d");
        if (c && ctx) {
          ctx.clearRect(0, 0, c.width, c.height);
          ctx.fillStyle = "#74e9b6";
          samples.forEach((v, i) => {
            const height = (v / 255) * 30;
            ctx.fillRect(i * 3, c.height / 2 - height / 2, 2, height);
          });
        }
        frame = requestAnimationFrame(draw);
      };
      draw();
      cleanup.current = () => {
        cancelAnimationFrame(frame);
        stream.getTracks().forEach((t) => t.stop());
        void context.close();
      };
    } catch {
      setError("Microphone permission is unavailable. Continue typing.");
      recognition.stop();
      setListening(false);
      cleanup.current();
    }
  }
  return (
    <div className="voice-control">
      <button
        type="button"
        className={`icon-button ${listening ? "recording" : ""}`}
        aria-label={listening ? "Stop recording" : "Dictate your answer"}
        aria-pressed={listening}
        onClick={toggle}
        disabled={disabled || transcribing}
      >
        {listening ? <Square size={17} /> : <Mic size={18} />}
      </button>
      {available && (
        <label className="checkbox">
          <input
            type="checkbox"
            checked={cloud}
            disabled={listening || transcribing}
            onChange={(e) => setCloud(e.target.checked)}
          />
          Google speech · sends audio
        </label>
      )}
      {listening && !cloud && (
        <canvas
          ref={canvas}
          width={192}
          height={36}
          aria-label="Live microphone audio waveform"
        />
      )}
      {caption && <span className="voice-caption">{caption}</span>}
      {error && <small role="status">{error}</small>}
    </div>
  );
}

export function Speak({
  text,
  investor,
  onState,
}: {
  text: string;
  investor: InvestorId;
  onState?: (speaking: boolean) => void;
}) {
  const [speaking, setSpeaking] = useState(false),
    [supported, setSupported] = useState(false),
    [cloud, setCloud] = useState(false),
    [error, setError] = useState("");
  const available = useCloudVoice(),
    audio = useRef<HTMLAudioElement | null>(null),
    objectUrl = useRef("");
  function stop() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    audio.current?.pause();
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = "";
    setSpeaking(false);
    onState?.(false);
  }
  useEffect(() => {
    setSupported("speechSynthesis" in window);
    window.addEventListener("pitchgrill-barge-in", stop);
    return () => {
      window.removeEventListener("pitchgrill-barge-in", stop);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      audio.current?.pause();
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    };
  }, []);
  async function speak() {
    if (speaking) {
      stop();
      return;
    }
    stop();
    setError("");
    if (cloud) {
      setSpeaking(true);
      try {
        const response = await audioRequest("/api/voice/speak", {
          text: text.slice(0, 2000),
          investor,
        });
        objectUrl.current = URL.createObjectURL(await response.blob());
        audio.current = new Audio(objectUrl.current);
        audio.current.onended = stop;
        await audio.current.play();
        onState?.(true);
      } catch (e) {
        setError((e as Error).message);
        stop();
      }
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text),
      index = { vc: 0, operator: 1, customer: 2, impact: 3 }[investor],
      voices = window.speechSynthesis
        .getVoices()
        .filter((v) => v.lang.startsWith("en"));
    if (voices.length) utterance.voice = voices[index % voices.length];
    utterance.pitch = [0.8, 0.95, 1.1, 1][index];
    utterance.rate = [1.08, 1, 0.95, 0.9][index];
    utterance.onend = stop;
    utterance.onerror = stop;
    utterance.onstart = () => {
      setSpeaking(true);
      onState?.(true);
    };
    window.speechSynthesis.speak(utterance);
  }
  return (
    <span className="voice-output">
      <button
        className={`icon-button speak-button ${speaking ? "speaking" : ""}`}
        aria-label={speaking ? "Stop speaking" : "Read investor response aloud"}
        aria-pressed={speaking}
        disabled={!supported && !cloud}
        onClick={() => void speak()}
      >
        <Volume2 size={14} />
      </button>
      {available && (
        <select
          aria-label="Investor voice provider"
          value={cloud ? "google" : "browser"}
          onChange={(e) => {
            stop();
            setCloud(e.target.value === "google");
          }}
        >
          <option value="browser">Browser voice</option>
          <option value="google">Google voice · sends text</option>
        </select>
      )}
      {error && <small role="status">{error}</small>}
    </span>
  );
}
