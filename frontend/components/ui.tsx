"use client";
import { useEffect, useState } from "react";
import { AlertCircle, LoaderCircle } from "lucide-react";
import type { Meta, PanelMember } from "@/lib/types";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function ErrorBox({
  error,
  retry,
}: {
  error: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error-box">
      <AlertCircle size={18} />
      <span>{error}</span>
      {retry && (
        <button className="text-button" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}
export function Loading({
  text = "Loading your workspace",
}: {
  text?: string;
}) {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" />
      <span>{text}</span>
      <div className="skeleton" />
      <div className="skeleton short" />
    </div>
  );
}
export function Empty({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-spark">✦</span>
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
export function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="metric-card">
      <span className="eyebrow">{label}</span>
      <strong>{value}</strong>
      {note && <small>{note}</small>}
    </div>
  );
}
export function useElapsed(active: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!active) return;
    const start = performance.now();
    setMs(0);
    const timer = setInterval(() => setMs(performance.now() - start), 100);
    return () => clearInterval(timer);
  }, [active]);
  return ms;
}
export function Thinking({ busy, meta }: { busy: boolean; meta?: Meta }) {
  const elapsed = useElapsed(busy);
  if (busy)
    return (
      <div className="thinking" role="status">
        <LoaderCircle size={16} className="spin" />
        Request in progress · {(elapsed / 1000).toFixed(1)}s
        <span>No artificial delay</span>
      </div>
    );
  if (!meta) return null;
  return (
    <div className="thinking-done">
      <Badge tone={meta.is_demo ? "amber" : "green"}>
        {meta.is_demo
          ? "Demo rules · no model call"
          : meta.degraded
            ? "Degraded provider mode"
            : "Live model response"}
      </Badge>
      <small>
        {(meta.ms / 1000).toFixed(2)}s · {meta.provider}/{meta.model}
        {meta.reasoning_tokens != null
          ? ` · ${meta.reasoning_tokens.toLocaleString()} reasoning tokens`
          : " · reasoning tokens unavailable"}
      </small>
      {meta.summary && (
        <details>
          <summary>Why the panel responded this way</summary>
          <p>{meta.summary}</p>
        </details>
      )}
    </div>
  );
}
export function Avatar({
  member,
  size = 76,
}: {
  member: PanelMember;
  size?: number;
}) {
  const variants = {
    vc: {
      skin: "#dcae8d",
      hair: "#353a41",
      jacket: "#283543",
      shirt: "#d9e4ec",
    },
    operator: {
      skin: "#c79173",
      hair: "#262329",
      jacket: "#3b4058",
      shirt: "#b8dbe4",
    },
    customer: {
      skin: "#b57959",
      hair: "#4d2c20",
      jacket: "#4b473e",
      shirt: "#e3d3b9",
    },
    impact: {
      skin: "#81563f",
      hair: "#272025",
      jacket: "#364e48",
      shirt: "#d0dad2",
    },
  };
  const v = variants[member.id];
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-label={member.name}
      role="img"
      className="investor-avatar"
    >
      <rect
        width="100"
        height="100"
        rx="26"
        fill={member.color}
        opacity=".09"
      />
      <circle cx="50" cy="45" r="26" fill={v.hair} />
      <path d="M12 100 Q12 71 37 70 H63 Q88 71 88 100" fill={v.jacket} />
      <path d="M39 67 L50 88 L61 67" fill={v.shirt} />
      <rect x="42" y="58" width="16" height="17" rx="6" fill={v.skin} />
      <ellipse cx="50" cy="44" rx="21" ry="26" fill={v.skin} />
      <path
        d={
          member.id === "impact"
            ? "M26 46 Q24 11 50 15 Q77 12 75 48 Q62 35 50 29 Q35 38 26 46"
            : member.id === "operator"
              ? "M29 40 Q23 11 55 17 Q83 23 71 41 Q49 37 34 29 Z"
              : "M28 38 Q24 12 54 17 Q78 15 73 39 L66 30 Q40 37 28 38"
        }
        fill={v.hair}
      />
      <circle cx="42" cy="46" r="2" fill="#29242b" />
      <circle cx="59" cy="46" r="2" fill="#29242b" />
      <path
        d="M45 58 Q50 61 56 57"
        fill="none"
        stroke="#704333"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {member.id === "vc" && (
        <g fill="none" stroke="#30343b" strokeWidth="2">
          <rect x="32" y="41" width="16" height="11" rx="4" />
          <rect x="53" y="41" width="16" height="11" rx="4" />
          <path d="M48 45 H53" />
        </g>
      )}
      {member.id === "customer" && (
        <path
          d="M26 43 Q16 38 28 29 M73 40 Q85 41 73 27"
          fill="none"
          stroke={v.hair}
          strokeWidth="8"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
export function money(
  value: number | null | undefined,
  currency = "USD",
  locale = "intl",
) {
  if (value == null) return "n/a";
  const steps: [number, string][] =
    locale === "IN"
      ? [
          [1e7, "Cr"],
          [1e5, "L"],
          [1e3, "K"],
        ]
      : [
          [1e9, "B"],
          [1e6, "M"],
          [1e3, "K"],
        ];
  const prefix = currency === "INR" ? "₹" : "$";
  for (const [divisor, suffix] of steps)
    if (Math.abs(value) >= divisor)
      return `${prefix}${(value / divisor).toFixed(1)}${suffix}`;
  return prefix + Math.round(value).toLocaleString();
}
