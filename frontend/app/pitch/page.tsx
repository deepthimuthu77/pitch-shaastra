"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Flame } from "lucide-react";
import { getConfig, post, api } from "@/lib/api";
import { Intake, type IntakeBody } from "@/components/intake";
import { Avatar, Thinking } from "@/components/ui";
import type { Config, Pitch } from "@/lib/types";

export default function NewPitch() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState<Config>();
  const [initial, setInitial] = useState<Partial<IntakeBody>>();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    getConfig()
      .then(setConfig)
      .catch(() => {});
    const parent = new URLSearchParams(window.location.search).get("retry");
    if (parent)
      api<Pitch>(`/api/pitches/${parent}`)
        .then((p) => {
          setInitial({
            idea: p.report?.rewritten_pitch || p.idea,
            title: p.title,
            difficulty: p.difficulty,
            parent_pitch_id: p.id,
          });
          setReady(true);
        })
        .catch((e) => {
          setError(e.message);
          setReady(true);
        });
    else setReady(true);
  }, []);
  async function start(body: IntakeBody) {
    setBusy(true);
    setError("");
    try {
      const pitch = await post<Pitch>("/api/pitch/start", body);
      router.push(`/pitch/${pitch.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR NEXT PITCH STARTS HERE</span>
          <h1>
            The pitch room<span className="mint-dot">.</span>
          </h1>
          <p>Four distinct perspectives. One idea worth defending.</p>
        </div>
        <Link href="/analysis" className="button ghost">
          Prefer the numbers? <ArrowRight size={15} />
        </Link>
      </div>
      <div className="intake-layout">
        <div>
          {ready && (
            <Intake
              kind="pitch"
              initial={initial}
              onSubmit={start}
              busy={busy}
              error={error}
            />
          )}
          <Thinking busy={busy} />
        </div>
        <aside className="intake-aside">
          <span className="eyebrow">MEET YOUR PANEL</span>
          {config?.panel.map((p) => (
            <div className="intake-investor" key={p.id}>
              <Avatar member={p} size={60} />
              <div>
                <strong>{p.name}</strong>
                <small style={{ color: p.color }}>{p.role}</small>
                <p>{p.lens}</p>
              </div>
            </div>
          ))}
          <div className="aside-note">
            <Flame size={20} />
            <h3>Pressure with a purpose.</h3>
            <p>
              Answer by typing or speaking. Take as many rounds as you need,
              then get your scorecard and a clearer pitch.
            </p>
            <p>
              You can finish early. Your progress is saved after each answer.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
