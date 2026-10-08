"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowRight, Check, MoveUpRight } from "lucide-react";

const perspectives = [
  {
    label: "The investor",
    role: "Market & defensibility",
    initial: "01",
    question: "What stops a bigger company from doing exactly this?",
    note: "A good idea opens the door. A defensible advantage keeps it open.",
    focus: "Your edge",
  },
  {
    label: "The operator",
    role: "Execution & economics",
    initial: "02",
    question: "What does it actually cost to win your next customer?",
    note: "Show the path from a promising pilot to a business that works.",
    focus: "Your model",
  },
  {
    label: "The customer",
    role: "Problem & demand",
    initial: "03",
    question: "Why would someone change what they already do?",
    note: "Make the problem specific. Give people a reason to switch.",
    focus: "Your customer",
  },
  {
    label: "The impact investor",
    role: "Outcomes & responsibility",
    initial: "04",
    question: "Who benefits as you grow—and how will you know?",
    note: "Connect your ambition to an outcome you can actually measure.",
    focus: "Your impact",
  },
];

export default function Home() {
  const [active, setActive] = useState(0);
  const perspective = perspectives[active];
  return (
    <>
      <section className="editorial-hero" aria-labelledby="hero-title">
        <div className="editorial-copy">
          <div className="edition-label">
            <span /> THE SHARK TANK SIMULATOR
          </div>
          <h1 id="hero-title">
            Conviction.
            <br />
            Meet <em>reality.</em>
          </h1>
          <p className="hero-deck">
            You believe in your idea.
            <br />
            Let’s make it stand up to the room.
          </p>
          <p className="hero-description">
            Enter the tank. State your ask, defend your valuation and face four
            investors. Negotiate a fictional deal—or walk away. Coaching helps
            you come back stronger.
          </p>
          <div className="hero-actions">
            <Link href="/pitch" className="button primary">
              Enter the pitch room <ArrowRight size={17} />
            </Link>
            <a href="#the-method" className="method-link">
              Explore the method <ArrowDown size={15} />
            </a>
          </div>
          <div className="hero-footnote">
            <span>
              <Check size={13} /> Start with a demo
            </span>
            <span>
              <Check size={13} /> Private by default
            </span>
          </div>
        </div>
        <div className="question-stage">
          <div className="stage-meta">
            <span>INSIDE THE PITCH ROOM</span>
            <span>01 — 04</span>
          </div>
          <div className="question-sheet">
            <div className="sheet-top">
              <span className="perspective-mark">{perspective.initial}</span>
              <span>
                {perspective.role}
                <small>Fictional investor panel · sample question</small>
              </span>
              <MoveUpRight size={20} />
            </div>
            <div className="question-content" key={active}>
              <span className="sheet-eyebrow">
                LET’S TALK ABOUT {perspective.focus.toUpperCase()}
              </span>
              <blockquote>“{perspective.question}”</blockquote>
              <p>{perspective.note}</p>
            </div>
            <div className="sheet-bottom">
              <span className="signal-bars" aria-hidden="true">
                {[8, 17, 12, 24, 32, 18, 26, 12, 20, 9, 16, 6].map(
                  (height, i) => (
                    <i key={i} style={{ height }} />
                  ),
                )}
              </span>
              <span>
                A sharper question.
                <br />A stronger answer.
              </span>
            </div>
          </div>
          <div
            className="perspective-controls"
            role="group"
            aria-label="Explore investor perspectives"
          >
            {perspectives.map((p, i) => (
              <button
                key={p.initial}
                type="button"
                aria-pressed={active === i}
                onClick={() => setActive(i)}
              >
                <span>0{i + 1}</span>
                {p.label}
              </button>
            ))}
          </div>
          <div className="stage-caption">
            <span>FOUR PERSPECTIVES. ONE STRONGER IDEA.</span>
            <span>↗</span>
          </div>
        </div>
      </section>
      <div className="principle-strip">
        <span>
          Made for the work <em>before</em> the breakthrough.
        </span>
        <div>
          Early ideas <span>/</span> First pitches <span>/</span> The next big
          meeting
        </div>
      </div>
      <section
        className="method-section"
        id="the-method"
        aria-labelledby="method-title"
      >
        <div className="editorial-section-heading">
          <span className="edition-label">THE METHOD / 01</span>
          <h2 id="method-title">
            Clarity is earned.
            <br />
            <span>One better question at a time.</span>
          </h2>
          <p>
            You don’t need another blank canvas. You need a way to see what
            holds up, what needs work, and what to do next.
          </p>
        </div>
        <div className="method-grid">
          {[
            {
              number: "01",
              title: "Find the evidence.",
              copy: "Turn the idea into assumptions you can inspect. Explore your market, model the economics, and see where the uncertainty lives.",
              link: "Explore idea analysis",
              href: "/analysis/new",
              tag: "FROM INSTINCT TO INSIGHT",
              words: ["Market", "Economics", "Risk"],
            },
            {
              number: "02",
              title: "Take the hard questions.",
              copy: "Put your pitch in front of four distinct perspectives. Answer the follow-ups, defend your thinking, and find the gaps before they matter.",
              link: "Practice your pitch",
              href: "/pitch",
              tag: "FROM INSIGHT TO CONVICTION",
              words: ["Pitch", "Challenge", "Respond"],
            },
            {
              number: "03",
              title: "Go back in stronger.",
              copy: "Leave with specific feedback, a clearer rewrite, and your next questions to prepare. Try again and compare what changed.",
              link: "See your progress",
              href: "/dashboard",
              tag: "FROM FEEDBACK TO PROGRESS",
              words: ["Reflect", "Refine", "Repeat"],
            },
          ].map((step) => (
            <Link href={step.href} className="method-step" key={step.number}>
              <div className="method-step-top">
                <span>{step.number}</span>
                <MoveUpRight size={22} />
              </div>
              <div className="method-notation" aria-hidden="true">
                {step.words.map((word, i) => (
                  <span key={word}>
                    {i > 0 && <ArrowRight size={12} />}
                    {word}
                  </span>
                ))}
              </div>
              <span className="eyebrow">{step.tag}</span>
              <h3>{step.title}</h3>
              <p>{step.copy}</p>
              <span className="method-step-link">
                {step.link} <ArrowRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="outcome-section" aria-labelledby="outcome-title">
        <div className="outcome-copy">
          <span className="edition-label">THE DIFFERENCE / 02</span>
          <h2 id="outcome-title">
            Less “trust me.”
            <br />
            More <em>“here’s why.”</em>
          </h2>
          <p>
            The goal isn’t a perfect score. It’s knowing where your story is
            strong—and having a plan for where it isn’t.
          </p>
          <Link href="/pitch" className="button primary">
            Face the investor panel <ArrowRight size={16} />
          </Link>
          <small>
            A fictional Shark Tank encounter. Coaching comes afterward.
          </small>
        </div>
        <div className="pitch-proof">
          <div className="proof-label">
            A PITCH, RECONSIDERED <span>ILLUSTRATIVE EXAMPLE</span>
          </div>
          <div className="proof-before">
            <span>THE CLAIM</span>
            <p>
              “Everyone needs this.
              <br />
              The market is enormous.”
            </p>
          </div>
          <div className="proof-after">
            <span>THE STRONGER START</span>
            <p>
              “We’re starting with independent clinics. Eight paid for our
              pilot. Six asked to stay.”
            </p>
            <div>
              <Check size={14} /> A specific customer <Check size={14} /> A
              measurable signal
            </div>
          </div>
          <p className="proof-note">
            Next question: what will you test to understand long-term retention?
          </p>
        </div>
      </section>
      <section className="honesty-section">
        <span className="edition-label">BUILT ON CLEAR GROUND</span>
        <h2>
          Ambitious about your idea.
          <br />
          Honest about the unknowns.
        </h2>
        <div className="honesty-grid">
          <div>
            <span>01 / YOUR WORK</span>
            <h3>Private by default.</h3>
            <p>
              Your workspace belongs to you. Share selected analysis sections
              only when you choose.
            </p>
          </div>
          <div>
            <span>02 / THE EVIDENCE</span>
            <h3>Assumptions stay visible.</h3>
            <p>
              Projections are estimates, not promises. Inspect the inputs and
              change them yourself.
            </p>
          </div>
          <div>
            <span>03 / THE EXPERIENCE</span>
            <h3>Know what you’re using.</h3>
            <p>
              Demo examples and simulated feedback are labelled. Live services
              require configuration.
            </p>
          </div>
        </div>
        <Link href="/setup" className="method-link">
          How PitchGrill works <ArrowRight size={15} />
        </Link>
      </section>
      <section className="closing-note">
        <span className="edition-label">
          YOUR NEXT CONVERSATION STARTS HERE
        </span>
        <h2>
          Walk in a little <em>more ready.</em>
        </h2>
        <Link href="/pitch" className="button primary">
          Start your first rehearsal <ArrowRight size={17} />
        </Link>
        <Link href="/analysis/new" className="method-link">
          Still shaping the idea? Start with analysis <ArrowRight size={15} />
        </Link>
      </section>
    </>
  );
}
