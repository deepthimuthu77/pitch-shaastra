"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BarChart3,
  Flame,
  HelpCircle,
  Home,
  Lightbulb,
  Moon,
  Settings,
  Sun,
} from "lucide-react";
import { getConfig } from "@/lib/api";

const links = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/pitch", label: "Pitch room", icon: Flame },
  { href: "/analysis", label: "Idea analysis", icon: Lightbulb },
  { href: "/dashboard", label: "Your progress", icon: BarChart3 },
  { href: "/setup", label: "Setup & services", icon: Settings },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mode, setMode] = useState("connecting");
  const [light, setLight] = useState(false);
  useEffect(() => {
    getConfig()
      .then((c) => setMode(c.mode))
      .catch(() => setMode("offline"));
    setLight(localStorage.getItem("pitchgrill-theme") === "light");
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
  }, [light]);
  if (pathname.startsWith("/r/")) return <main>{children}</main>;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Flame size={22} />
          </span>
          pitchgrill<span className="brand-dot">.</span>
        </Link>
        <div className="workspace-label">YOUR FOUNDER WORKSPACE</div>
        <nav aria-label="Main navigation">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={`nav-link ${(href === "/" ? pathname === "/" : pathname.startsWith(href)) ? "selected" : ""}`}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <HelpCircle size={19} />
            <strong>Practice with purpose.</strong>
            <p>A tough question now is a better answer when it matters.</p>
            <Link href="/setup">
              How it works <span>↗</span>
            </Link>
          </div>
          <div className="account">
            <span className="account-avatar">F</span>
            <span>
              <strong>Founder workspace</strong>
              <small>
                {mode === "demo"
                  ? "Local guest · demo mode"
                  : mode === "live"
                    ? "Firebase · live mode"
                    : "Backend " + mode}
              </small>
            </span>
            <button
              className="icon-button"
              aria-label={
                light ? "Switch to dark theme" : "Switch to light theme"
              }
              onClick={() => {
                setLight(!light);
                localStorage.setItem(
                  "pitchgrill-theme",
                  light ? "dark" : "light",
                );
              }}
            >
              {light ? <Moon size={17} /> : <Sun size={17} />}
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span>
            <span className="status-dot" /> THE PRACTICE BEFORE THE PITCH
          </span>
          <Link href="/setup" className="mode-pill">
            {mode === "demo"
              ? "DEMO · NO API KEYS NEEDED"
              : mode === "live"
                ? "LIVE · CONNECTED PROVIDERS"
                : "CONNECTING TO BACKEND"}
            <span>↗</span>
          </Link>
        </header>
        <main className="page-content">{children}</main>
        <footer className="footer">
          Built for the moment before the meeting.
          <span>
            Practice judgments and transparent estimates. Not investment or
            legal advice.
          </span>
        </footer>
      </div>
    </div>
  );
}
