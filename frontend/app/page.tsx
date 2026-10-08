"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Flame,
  LineChart,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { motion } from "framer-motion";
import { getConfig } from "@/lib/api";
import type { PanelMember } from "@/lib/types";
import { Avatar, Badge } from "@/components/ui";

export default function Home() {
  const [panel, setPanel] = useState<PanelMember[]>([]);
  useEffect(() => {
    getConfig()
      .then((c) => setPanel(c.panel))
      .catch(() => {});
  }, []);
  return (
    <>
      <div className="page-title">
        <div>
          <span className="eyebrow">THE FOUNDER&apos;S REHEARSAL ROOM</span>
          <h1>
            Good ideas deserve
            <br />a <em>great pitch.</em>
          </h1>
          <p className="lead">
            Meet the questions you weren&apos;t ready for.
            <br />
            Leave with the answers you wish you&apos;d had.
          </p>
        </div>
        <Badge tone="green">✦ BUILT FOR FOUNDERS</Badge>
      </div>
      <section className="hero-room">
        <div className="hero-copy">
          <span className="live-label">
            <span className="status-dot" />
            YOUR INVESTOR PANEL IS READY
          </span>
          <h2>
            Four perspectives.
            <br />
            No easy questions.
          </h2>
          <p>
            A skeptical VC. An operator. A customer advocate. An impact
            investor. They don&apos;t all agree—and that&apos;s the point.
          </p>
          <div className="button-row">
            <Link className="button primary" href="/pitch">
              Enter the pitch room <ArrowRight size={17} />
            </Link>
            <Link className="button ghost" href="/analysis/new">
              Analyze an idea <ChevronRight size={17} />
            </Link>
          </div>
          <div className="hero-reassurance">
            <span>
              <Check size={13} /> No account needed for the demo
            </span>
            <span>
              <Check size={13} /> Your ideas stay private
            </span>
          </div>
        </div>
        <div className="room-art" aria-label="Illustrated investor panel">
          <div className="room-glow" />
          <div className="room-window" />
          <div className="room-seats">
            {panel.map((member, i) => (
              <motion.div
                className="room-person"
                key={member.id}
                style={{ "--accent": member.color } as React.CSSProperties}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08 }}
              >
                <Avatar member={member} size={110} />
                <span>{member.name.split(" ")[0]}</span>
                <small>
                  {member.id === "vc" ? "VC" : member.id.toUpperCase()}
                </small>
                <div className="seat-light" />
              </motion.div>
            ))}
          </div>
          <div className="boardroom-table">
            <span>PITCHGRILL</span>
          </div>
          <div className="room-caption">
            <span className="status-dot" /> A safe room for difficult
            conversations
          </div>
        </div>
      </section>
      <div className="section-heading">
        <div>
          <span className="eyebrow">PRACTICE. CHALLENGE. IMPROVE.</span>
          <h2>Walk in with an idea. Walk out with a plan.</h2>
        </div>
        <Link href="/setup" className="text-link">
          See how it works <ArrowRight size={15} />
        </Link>
      </div>
      <div className="feature-grid">
        {[
          {
            icon: Flame,
            label: "01 / THE GRILL",
            title: "Get put on the spot.",
            text: "Adaptive follow-ups, investor disagreements, and a little pressure. Questions follow your answers, not a script.",
            href: "/pitch",
            color: "coral",
          },
          {
            icon: LineChart,
            label: "02 / THE ANALYSIS",
            title: "Challenge every assumption.",
            text: "Transparent market ranges, revenue scenarios, competitors, risks, and a model you can change yourself.",
            href: "/analysis/new",
            color: "mint",
          },
          {
            icon: Target,
            label: "03 / THE NEXT ATTEMPT",
            title: "Come back sharper.",
            text: "An evidence-backed scorecard, rewritten pitch, toughest-question prep sheet, and a visible before-and-after.",
            href: "/dashboard",
            color: "amber",
          },
        ].map(({ icon: Icon, ...f }) => (
          <Link
            href={f.href}
            className={`feature-card ${f.color}`}
            key={f.title}
          >
            <div className="feature-top">
              <Icon size={24} />
              <span>{f.label}</span>
              <ArrowRight size={17} />
            </div>
            <h3>{f.title}</h3>
            <p>{f.text}</p>
          </Link>
        ))}
      </div>
      <section className="panel-intro">
        <div>
          <span className="eyebrow">KNOW WHO&apos;S ACROSS THE TABLE</span>
          <h2>
            Different lenses.
            <br />
            The same high bar.
          </h2>
          <p>
            Every investor has a blind spot they&apos;ll make sure you
            don&apos;t.
          </p>
        </div>
        <div className="persona-grid">
          {panel.map((p) => (
            <div key={p.id} className="persona-mini">
              <Avatar member={p} size={58} />
              <div>
                <h3>{p.role}</h3>
                <p>{p.lens}</p>
                <small style={{ color: p.color }}>{p.style}</small>
              </div>
            </div>
          ))}
        </div>
      </section>
      <div className="trust-strip">
        <ShieldCheck size={21} />
        <div>
          <strong>Clear about what&apos;s real.</strong>
          <p>
            Demo coaching is labelled. Live model timing is measured. Every
            projection exposes its assumptions.
          </p>
        </div>
        <Sparkles size={22} />
        <Link href="/setup">
          Explore the setup <ArrowRight size={15} />
        </Link>
      </div>
    </>
  );
}
