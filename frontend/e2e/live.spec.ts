import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";

test("Live Docker: Firebase, grounded analysis, panel, deal, exports and isolation", async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(1_200_000);
  page.setDefaultTimeout(30_000);
  const base = process.env.E2E_API_URL || "http://localhost:8000";
  const config = await (await request.get(`${base}/api/config`)).json();
  expect(config.mode).toBe("live");
  const health = await (await request.get(`${base}/health`)).json();
  expect(health.storage).toBe("firestore");
  expect(health.worker_ready).toBe(true);
  let authorization = "";
  page.on("request", (r) => {
    if (r.url().startsWith(base)) {
      const value = r.headers().authorization;
      if (value) authorization = value;
    }
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const evidence: Record<string, unknown> = { health, panel: [] };
  const get = async (path: string) => {
    const response = await request.get(`${base}${path}`, {
      headers: { Authorization: authorization },
    });
    expect(response.status(), path).toBe(200);
    return response.json();
  };
  const live = (meta: {
    provider: string;
    is_demo: boolean;
    model: string;
  }) => {
    expect(meta.is_demo).toBe(false);
    expect(meta.provider).toBe("groq");
    expect(meta.model).not.toContain("120b");
  };
  try {
    await page.goto("/pitch");
    console.log("Live flow: intake loaded");
    await page
      .getByRole("button", { name: "Strong pitch", exact: true })
      .click();
    await page
      .getByLabel("Idea name", { exact: true })
      .fill("Live E2E clinic pilot");
    await page
      .getByRole("button", { name: /Research, customer & model settings/ })
      .click();
    await page.getByLabel(/Allow public market research/).check();
    await page.getByLabel(/I consent to sending this idea/).check();
    console.log("Live flow: consent selected");
    const started = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/pitch/start") && r.request().method() === "POST",
      { timeout: 180_000 },
    );
    await page.getByRole("button", { name: "Take the floor" }).click();
    const startResponse = await Promise.race([
      started,
      page
        .locator(".error-box")
        .waitFor({ state: "visible", timeout: 180_000 })
        .then(async () => {
          throw new Error(await page.locator(".error-box").innerText());
        }),
    ]);
    expect(startResponse.status()).toBe(200);
    let pitch = await startResponse.json();
    live(pitch.llm_meta);
    expect(pitch.is_synthetic).toBe(false);
    expect(
      pitch.messages.filter(
        (m: { speaker: string }) => m.speaker !== "founder",
      ),
    ).toHaveLength(4);
    const analysisId = pitch.analysis_id;
    let analysis = await get(`/api/analysis/${analysisId}`);
    await expect
      .poll(
        async () => {
          analysis = await get(`/api/analysis/${analysisId}`);
          return analysis.status;
        },
        { timeout: 750_000, intervals: [5_000] },
      )
      .toMatch(/^(done|partial|failed)$/);
    evidence.analysis = {
      status: analysis.status,
      warnings: analysis.warnings,
      calls: analysis.versions?.calls,
      source_count: analysis.sections?.sources?.items?.length,
    };
    expect(analysis.status).not.toBe("failed");
    expect
      .soft(
        analysis.sections.sources.items.length,
        "Google Search grounding must return real citations",
      )
      .toBeGreaterThan(0);
    expect(analysis.versions.calls.length).toBeGreaterThan(5);
    for (const call of analysis.versions.calls) live(call);
    const answers = [
      "Our 8 pilot clinics paid $80 monthly over 6 weeks. We measured 120 recovered appointments and 6 clinics asked to renew. These are founder-reported pilot results, not independently verified market facts.",
      "Our delivery cost was measured at $12 per clinic monthly and acquisition cost at $150 per paying clinic in the small pilot. We have not measured long-term churn yet and plan a retention study rather than claiming guaranteed growth.",
      "Our reachable segment is a founder estimate of 200 independent clinics in our network. We do not claim a huge market or no competitors. Existing scheduling tools and manual phone reminders are alternatives to investigate.",
      "Our operations lead managed clinic scheduling for 4 years. We require explicit opt-in for reminders, minimize patient data, restrict staff access, and will seek a jurisdiction-specific privacy review before expansion.",
      "We seek $100000 for 10% equity to validate retention and a repeatable clinic referral channel. Those terms are a negotiating proposal. Our monthly burn and funding milestones are estimates to validate, not demonstrated financial results.",
    ];
    for (const answer of answers) {
      await page
        .getByRole("textbox", { name: "Your answer", exact: true })
        .fill(answer);
      const responded = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/pitch/answer") &&
          r.request().method() === "POST",
        { timeout: 180_000 },
      );
      await page.getByRole("button", { name: "Send answer" }).click();
      const response = await responded;
      expect(response.status()).toBe(200);
      pitch = await response.json();
      live(pitch.llm_meta);
      (evidence.panel as unknown[]).push({
        meta: pitch.llm_meta,
        question: pitch.next_question,
        messages: pitch.messages.slice(-5),
      });
      const founder = pitch.messages
        .filter((m: { speaker: string }) => m.speaker === "founder")
        .at(-1);
      for (const flag of founder.flags) expect(answer).toContain(flag.quote);
      if (answer.includes("not measured long-term churn"))
        expect(
          founder.flags.some((f: { flag: string }) => f.flag === "dodged"),
        ).toBe(false);
      if (answer.includes("We do not claim a huge market"))
        expect(
          founder.flags.some((f: { quote: string }) =>
            /huge market|no competitors/.test(f.quote),
          ),
        ).toBe(false);
      await expect(
        page.getByRole("textbox", { name: "Your answer", exact: true }),
      ).toHaveValue("");
    }
    await page.screenshot({
      path: "test-results/live-panel.png",
      fullPage: true,
    });
    const finished = page.waitForResponse(
      (r) =>
        r.url().endsWith("/api/pitch/finish") &&
        r.request().method() === "POST",
      { timeout: 180_000 },
    );
    await page.getByRole("button", { name: "Hear the panel verdict" }).click();
    const finishedResponse = await finished;
    expect(finishedResponse.status()).toBe(200);
    pitch = await finishedResponse.json();
    live(pitch.llm_meta);
    expect(pitch.report.verdicts).toHaveLength(4);
    expect(pitch.report.prep_sheet).toHaveLength(5);
    evidence.verdict = {
      meta: pitch.llm_meta,
      verdicts: pitch.report.verdicts,
      offers: pitch.report.simulated_offers,
    };
    await expect(
      page.getByRole("heading", { name: "Who is in? Who is out?" }),
    ).toBeVisible({ timeout: 60_000 });
    if (pitch.report.simulated_offers.length) {
      await page
        .getByRole("button", { name: "Counteroffer", exact: true })
        .first()
        .click();
      const countered = page.waitForResponse(
        (r) =>
          r.url().endsWith("/api/pitch/deal") &&
          r.request().method() === "POST",
        { timeout: 90_000 },
      );
      await page
        .getByRole("button", { name: "Submit counteroffer", exact: true })
        .click();
      const counterResponse = await countered;
      expect(counterResponse.status()).toBe(200);
      pitch = await counterResponse.json();
      evidence.negotiation = pitch.negotiation_reaction;
      live(pitch.negotiation_reaction.meta);
      await page
        .getByRole("button", { name: "Accept simulated offer", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("heading", { name: "You have a simulated deal." }),
      ).toBeVisible({ timeout: 90_000 });
    } else {
      evidence.negotiation = "Panel legitimately made no offers";
      await page.getByRole("button", { name: /Leave the tank/ }).click();
    }
    await page.screenshot({
      path: "test-results/live-deal.png",
      fullPage: true,
    });
    await page.getByRole("link", { name: "Open coaching report" }).click();
    await expect(
      page.getByRole("heading", { name: "Your scorecard" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Your improvement plan" }),
    ).toBeVisible();
    await page
      .getByRole("link", { name: "Challenge the idea's assumptions" })
      .click();
    await page.getByRole("button", { name: "What if?", exact: true }).click();
    const slider = page.getByRole("slider").nth(9);
    await slider.focus();
    await slider.press("ArrowRight");
    await page
      .getByRole("button", { name: "Save scenario as a new version" })
      .click();
    await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "JSON", exact: true }).click();
    expect((await download).suggestedFilename()).toMatch(/\.json$/);
    await page.evaluate(() => {
      window.print = () => {};
    });
    await page.getByRole("button", { name: "PDF", exact: true }).click();
    await page.pdf({
      path: "test-results/live-report.pdf",
      format: "A4",
      printBackground: true,
    });
    await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
    await page.getByRole("button", { name: "Share", exact: true }).click();
    for (const box of await page.locator(".share-section-list input").all())
      if (await box.isChecked()) await box.uncheck();
    await page
      .locator(".share-section-list label")
      .filter({ hasText: /^market$/ })
      .getByRole("checkbox")
      .check();
    await page.getByRole("button", { name: "Create read-only link" }).click();
    const shared = await page.locator(".share-result a").getAttribute("href");
    const publicPage = await context.newPage();
    await publicPage.goto(shared!);
    await expect(
      publicPage.getByRole("tab", { name: "Market", exact: true }),
    ).toBeVisible();
    await expect(
      publicPage.getByRole("tab", { name: "Assumptions", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    await publicPage.reload();
    await expect(
      publicPage.getByText(/Share expired, revoked or unavailable/),
    ).toBeVisible();
    await publicPage.close();
    const guest = await request.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(config.firebase.apiKey)}`,
      { data: { returnSecureToken: true } },
    );
    expect(guest.status()).toBe(200);
    const other = await guest.json();
    try {
      const response = await request.get(`${base}/api/pitches/${pitch.id}`, {
        headers: { Authorization: `Bearer ${other.idToken}` },
      });
      expect(response.status()).toBe(404);
      expect(
        (
          await request.post(`${base}/api/demo/seed`, {
            headers: { Authorization: authorization },
          })
        ).status(),
      ).toBe(404);
    } finally {
      await request.post(
        `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(config.firebase.apiKey)}`,
        { data: { idToken: other.idToken } },
      );
    }
    await page.goto("/dashboard");
    await expect(
      page.getByText("Live E2E clinic pilot", { exact: true }).first(),
    ).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/analysis/${analysisId}`);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth + 2,
      ),
    ).toBe(false);
    await page.goto("/setup");
    await expect(
      page.getByRole("heading", { name: "The service map." }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    writeFileSync(
      "test-results/live-evidence.json",
      JSON.stringify(evidence, null, 2),
    );
  }
});
