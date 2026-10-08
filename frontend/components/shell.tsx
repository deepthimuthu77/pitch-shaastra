"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Flame, Menu, Moon, Sun, X } from "lucide-react";
import { getConfig } from "@/lib/api";

const links = [
  { href: "/", label: "Overview" },
  { href: "/pitch", label: "Pitch room" },
  { href: "/analysis", label: "Idea analysis" },
  { href: "/dashboard", label: "Your progress" },
];
const steps = [
  { href: "/pitch", title: "Enter the tank", detail: "Panel & negotiation" },
  { href: "/analysis", title: "Defend the numbers", detail: "Idea analysis" },
  {
    href: "/dashboard",
    title: "Prepare your return",
    detail: "Coaching & progress",
  },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mode, setMode] = useState("connecting");
  const [light, setLight] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => {
    getConfig()
      .then((c) => setMode(c.mode))
      .catch(() => setMode("offline"));
    try {
      setLight(localStorage.getItem("pitchgrill-theme") === "light");
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = light ? "light" : "dark";
  }, [light]);
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);
  const selected = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  if (pathname.startsWith("/r/")) return <main>{children}</main>;
  return (
    <div className="studio-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="studio-header no-print">
        <Link href="/" className="studio-brand" aria-label="PitchGrill home">
          <Flame size={27} strokeWidth={1.8} />
          pitchgrill<span>®</span>
        </Link>
        <nav
          className={`studio-nav ${menuOpen ? "is-open" : ""}`}
          id="main-navigation"
          aria-label="Main navigation"
        >
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              aria-current={selected(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
          <Link href="/setup" className="mobile-guide">
            Guide & setup
          </Link>
        </nav>
        <div className="studio-tools">
          <Link
            href="/setup"
            className={`connection-label ${mode === "offline" ? "is-offline" : ""}`}
          >
            <span className="status-dot" />
            {mode === "demo"
              ? "Demo workspace"
              : mode === "live"
                ? "Live workspace"
                : mode === "offline"
                  ? "Service offline"
                  : "Connecting"}
          </Link>
          <button
            className="icon-button"
            aria-label={
              light ? "Switch to dark theme" : "Switch to light theme"
            }
            onClick={() => {
              setLight(!light);
              try {
                localStorage.setItem(
                  "pitchgrill-theme",
                  light ? "dark" : "light",
                );
              } catch {}
            }}
          >
            {light ? <Moon size={17} /> : <Sun size={17} />}
          </button>
          <button
            className="icon-button menu-toggle"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            aria-expanded={menuOpen}
            aria-controls="main-navigation"
            onClick={() => setMenuOpen(!menuOpen)}
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>
      {pathname !== "/" && (
        <nav className="journey-nav no-print" aria-label="Your tank journey">
          <span className="journey-caption">Face the tank.</span>
          {steps.map((step, i) => (
            <Link
              href={step.href}
              key={step.href}
              aria-current={selected(step.href) ? "step" : undefined}
            >
              <span className="journey-number">0{i + 1}</span>
              <span>
                {step.title}
                <small>{step.detail}</small>
              </span>
              <ArrowRight size={15} />
            </Link>
          ))}
        </nav>
      )}
      <main
        id="main-content"
        className={`studio-content ${pathname === "/" ? "studio-home" : ""}`}
      >
        {children}
      </main>
      <footer className="studio-footer no-print">
        <div>
          <Link href="/" className="studio-brand">
            <Flame size={22} />
            pitchgrill
          </Link>
          <p>A little practice. A different conversation.</p>
        </div>
        <div className="footer-links">
          <Link href="/setup">
            Guide & setup <ArrowRight size={13} />
          </Link>
          <Link href="/cohorts">
            Cohort workspace <ArrowRight size={13} />
          </Link>
          <small>
            Practice feedback and estimates.
            <br />
            Not investment or legal advice.
          </small>
        </div>
      </footer>
    </div>
  );
}
