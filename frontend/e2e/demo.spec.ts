import { test, expect } from "@playwright/test";

test("Docker demo: pitch, report, scenario version, selective share and dashboard", async ({
  page,
  context,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Conviction.*Meet reality/ }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Enter the pitch room", exact: true })
    .click();
  await page.getByRole("button", { name: "Strong pitch", exact: true }).click();
  await page.getByRole("button", { name: "Take the floor" }).click();
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".tank-stakes")).toContainText("has the floor");
  const roomSound = page.getByRole("button", {
    name: "Enable room sound",
    exact: true,
  });
  await expect(roomSound).toHaveAttribute("aria-pressed", "false");
  await roomSound.click();
  await expect(
    page.getByRole("button", { name: "Mute room sound", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Mute room sound", exact: true })
    .click();
  for (const answer of [
    "Our 8 pilot clinics paid $80 monthly and 6 asked to renew. We interviewed the operations managers and measured 120 recovered appointments over 6 weeks.",
    "We measured delivery cost at $12 per clinic and paid acquisition cost at $150. We have not measured long-term churn and will validate it in a retention pilot.",
    "Our reachable segment is an estimated 200 clinics in our local network. This is a founder estimate to validate; we do not claim a huge market or no competitors.",
  ]) {
    await page
      .getByRole("textbox", { name: "Your answer", exact: true })
      .fill(answer);
    await page.getByRole("button", { name: "Send answer" }).click();
    await expect(
      page.getByRole("textbox", { name: "Your answer", exact: true }),
    ).toHaveValue("");
  }
  await page.screenshot({
    path: "test-results/pitch-room.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Hear the panel verdict" }).click();
  await expect(
    page.getByRole("heading", { name: "Who is in? Who is out?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Counteroffer", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Submit counteroffer", exact: true })
    .click();
  await expect(page.locator(".deal-reaction")).toContainText(
    "Rules-based dialogue",
  );
  await page
    .getByRole("button", { name: "Accept simulated offer", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "You have a simulated deal." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/negotiation-room.png",
    fullPage: true,
  });
  await page.getByText("Negotiation history", { exact: true }).click();
  await expect(page.getByText(/accept.*existing terms/)).toBeVisible();
  await page.getByRole("link", { name: "Open coaching report" }).click();
  await expect(
    page.getByRole("heading", { name: "Your scorecard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your toughest-question prep sheet." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/pitch-report.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Challenge the idea's assumptions" })
    .click();
  await expect(
    page.getByRole("tab", { name: "Revenue", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Revenue", exact: true }).click();
  await page.screenshot({
    path: "test-results/analysis-revenue.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "What if?", exact: true }).click();
  const sliders = page.getByRole("slider");
  expect(await sliders.count()).toBeGreaterThanOrEqual(14);
  const slider = sliders.nth(9);
  await slider.focus();
  await slider.press("ArrowRight");
  const save = page.getByRole("button", {
    name: "Save scenario as a new version",
  });
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await page.evaluate(() => {
    window.print = () => {};
  });
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Every number has an origin." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The receipts." }),
  ).toBeVisible();
  await page.pdf({
    path: "test-results/analysis-report.pdf",
    format: "A4",
    printBackground: true,
  });
  await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
  await page.getByRole("button", { name: "Share", exact: true }).click();
  for (const checkbox of await page.locator(".share-section-list input").all())
    if (await checkbox.isChecked()) await checkbox.uncheck();
  await page
    .locator(".share-section-list label")
    .filter({ hasText: /^market$/ })
    .getByRole("checkbox")
    .check();
  await page.getByRole("button", { name: "Create read-only link" }).click();
  const shared = await page.locator(".share-result a").getAttribute("href");
  expect(shared).toBeTruthy();
  const publicPage = await context.newPage();
  await publicPage.goto(shared!);
  await expect(
    publicPage.getByRole("tab", { name: "Market", exact: true }),
  ).toBeVisible();
  await expect(
    publicPage.getByRole("tab", { name: "Assumptions", exact: true }),
  ).toHaveCount(0);
  await expect(
    publicPage.getByRole("button", { name: "What if?", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Revoke", exact: true }).click();
  await publicPage.reload();
  await expect(
    publicPage.getByText(/Share expired, revoked or unavailable/),
  ).toBeVisible();
  await publicPage.close();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.goto("/dashboard");
  await expect(
    page.getByText("Shiftwise", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/setup");
  await expect(
    page.getByRole("heading", { name: "The service map." }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Mobile navigation and standalone analysis", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/analysis/new");
  await page
    .getByRole("button", { name: "Promising idea", exact: true })
    .click();
  await page.getByRole("button", { name: "Build my analysis" }).click();
  await expect(
    page.getByRole("tab", { name: "Assumptions", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Assumptions", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Every number has an origin." }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/analysis-mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 2,
  );
  expect(overflow).toBe(false);
});
