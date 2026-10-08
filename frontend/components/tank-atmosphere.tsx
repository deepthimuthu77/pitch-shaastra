"use client";
import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export function TankAtmosphere({ quiet = false }: { quiet?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const ducked = useRef(quiet);
  const sounding = useRef(enabled);
  sounding.current = enabled;
  ducked.current = quiet;
  useEffect(() => {
    const context = audio.current;
    if (context && gain.current)
      gain.current.gain.setTargetAtTime(
        enabled && !quiet && !document.hidden ? 0.012 : 0,
        context.currentTime,
        0.2,
      );
  }, [enabled, quiet]);
  useEffect(() => {
    function visibility() {
      const context = audio.current;
      if (!context || !gain.current) return;
      gain.current.gain.setTargetAtTime(
        document.hidden || ducked.current || !sounding.current ? 0 : 0.012,
        context.currentTime,
        0.2,
      );
    }
    document.addEventListener("visibilitychange", visibility);
    return () => {
      document.removeEventListener("visibilitychange", visibility);
      void audio.current?.close();
      audio.current = null;
    };
  }, []);
  async function toggle() {
    setError("");
    if (enabled) {
      gain.current?.gain.setValueAtTime(0, audio.current!.currentTime);
      await audio.current?.suspend();
      setEnabled(false);
      return;
    }
    try {
      if (!audio.current) {
        const context = new AudioContext();
        audio.current = context;
        gain.current = context.createGain();
        gain.current.gain.value = 0;
        gain.current.connect(context.destination);
        for (const frequency of [82.41, 123.47]) {
          const tone = context.createOscillator();
          tone.type = "sine";
          tone.frequency.value = frequency;
          tone.connect(gain.current);
          tone.start();
        }
      }
      await audio.current.resume();
      setEnabled(true);
    } catch {
      setError("Room sound is unavailable in this browser.");
    }
  }
  return (
    <div className="tank-atmosphere no-print">
      <div>
        <span className="tank-studio-light" aria-hidden="true" />
        <span className="eyebrow">INSIDE THE TANK</span>
        <span className="tank-stage-caption">
          Four investors. One founder. Your decision.
        </span>
      </div>
      <button
        className="button ghost"
        aria-pressed={enabled}
        onClick={() => void toggle()}
      >
        {enabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
        {enabled ? "Mute room sound" : "Enable room sound"}
      </button>
      {error && <small role="status">{error}</small>}
    </div>
  );
}
