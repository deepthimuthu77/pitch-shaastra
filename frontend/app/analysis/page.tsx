"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { api } from "@/lib/api";
import type { Analysis } from "@/lib/types";
import { Badge, Empty, ErrorBox, Loading } from "@/components/ui";

export default function Analyses() {
  const [rows, setRows] = useState<Analysis[]>();
  const [error, setError] = useState("");
  const load = () =>
    api<Analysis[]>("/api/analysis")
      .then(setRows)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">PITCHGRILL ANALYTICS</span>
          <h1>
            Know what holds up<span className="mint-dot">.</span>
          </h1>
          <p>
            Transparent assumptions. Cited research. A model you can challenge.
          </p>
        </div>
        <Link className="button primary" href="/analysis/new">
          <Plus size={17} />
          Analyze an idea
        </Link>
      </div>
      <div className="analysis-explainer">
        <span>
          01 <strong>Describe the idea</strong>
        </span>
        <span>→</span>
        <span>
          02 <strong>Inspect the evidence</strong>
        </span>
        <span>→</span>
        <span>
          03 <strong>Change the assumptions</strong>
        </span>
      </div>
      {error ? (
        <ErrorBox error={error} retry={load} />
      ) : !rows ? (
        <Loading />
      ) : !rows.length ? (
        <Empty
          title="Every idea starts with assumptions."
          text="Make yours visible. Analyze an idea without entering the pitch room."
        >
          <Link href="/analysis/new" className="button primary">
            Create your first analysis <ArrowRight size={17} />
          </Link>
        </Empty>
      ) : (
        <div className="analysis-list">
          {rows.map((row) => (
            <Link
              href={`/analysis/${row.id}`}
              className="analysis-list-card"
              key={row.id}
            >
              <div>
                <div className="inline-meta">
                  <Badge
                    tone={
                      row.status === "failed"
                        ? "coral"
                        : row.status === "done"
                          ? "green"
                          : "amber"
                    }
                  >
                    {row.status}
                  </Badge>
                  {row.is_synthetic && <Badge>Demo</Badge>}
                  <span>Version {row.version}</span>
                </div>
                <h2>{row.title}</h2>
                <p>{row.profile?.segment || row.idea_text?.slice(0, 160)}</p>
                <small>
                  {row.inputs.geography} · {row.inputs.currency} ·{" "}
                  {row.inputs.horizon_months} months ·{" "}
                  {new Date(row.created_at * 1000).toLocaleDateString()}
                </small>
              </div>
              <div>
                <span className="eyebrow">EVIDENCE CONFIDENCE</span>
                <strong>{row.confidence?.level || "In progress"}</strong>
                <ArrowRight size={20} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
