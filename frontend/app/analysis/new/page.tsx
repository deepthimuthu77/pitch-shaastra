"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/api";
import { Intake, type IntakeBody } from "@/components/intake";
import { Thinking } from "@/components/ui";

export default function NewAnalysis() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(body: IntakeBody) {
    setBusy(true);
    setError("");
    const { difficulty, parent_pitch_id, analytics_consent, ...input } = body;
    void difficulty;
    void parent_pitch_id;
    void analytics_consent;
    try {
      const data = await post<{ analysis_id: string }>("/api/analysis", input);
      router.push(`/analysis/${data.analysis_id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">STANDALONE IDEA INTELLIGENCE</span>
          <h1>
            The numbers, with the receipts<span className="mint-dot">.</span>
          </h1>
          <p>
            Every projection comes from code. Every assumption is yours to
            challenge.
          </p>
        </div>
      </div>
      <div className="standalone-intake">
        <Intake kind="analysis" onSubmit={submit} busy={busy} error={error} />
        <Thinking busy={busy} />
      </div>
    </>
  );
}
