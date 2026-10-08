import { test, expect } from "@playwright/test";

test("A disputed flag stays reviewable and a weakness starts focused practice", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/pitch");
  await page.getByRole("button", { name: "Weak pitch", exact: true }).click();
  await page.getByRole("button", { name: "Take the floor" }).click();
  await page
    .getByRole("textbox", { name: "Your answer", exact: true })
    .fill(
      "Everyone needs it and it is a huge market. We will grow fast and be the leader with no competitors.",
    );
  await page.getByRole("button", { name: "Send answer" }).click();
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).toHaveValue("");
  await page
    .locator(".message-flags details")
    .first()
    .locator("summary")
    .click();
  page.once("dialog", (dialog) =>
    dialog.accept(
      "This statement refers to our narrow pilot workflow, not the entire market.",
    ),
  );
  await page
    .getByRole("button", { name: "Challenge this flag", exact: true })
    .first()
    .click();
  await expect(page.getByText(/Founder review: dismiss/).first()).toBeVisible();
  await page.getByRole("button", { name: "Hear the panel verdict" }).click();
  await page.getByRole("link", { name: "Open coaching report" }).click();
  await expect(
    page.getByRole("heading", { name: "Your improvement plan" }),
  ).toBeVisible();
  await expect(page.getByText(/Evidence coverage:/)).toBeVisible();
  await expect(page.locator(".diff-added").first()).toBeVisible();
  await page
    .getByRole("button", { name: /^Practice (?!this question)/ })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Your answer", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Deep dive focus:/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("Spoken practice captions interim speech and submits only final speech", async ({
  page,
}) => {
  await page.addInitScript(() => {
    class Recognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      start() {
        (
          window as unknown as { testRecognition: Recognition }
        ).testRecognition = this;
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    Object.defineProperty(window, "SpeechRecognition", {
      value: Recognition,
      configurable: true,
    });
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        cancel() {},
        getVoices() {
          return [];
        },
        speak(u: SpeechSynthesisUtterance) {
          u.onstart?.(new SpeechSynthesisEvent("start", { utterance: u }));
          setTimeout(
            () => u.onend?.(new SpeechSynthesisEvent("end", { utterance: u })),
            10,
          );
        },
      },
      configurable: true,
    });
  });
  await page.goto("/pitch");
  await page.getByRole("button", { name: "Strong pitch", exact: true }).click();
  await page.getByRole("button", { name: "Take the floor" }).click();
  await page.getByRole("button", { name: "Start spoken practice" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(
          (window as unknown as { testRecognition?: unknown }).testRecognition,
        ),
      ),
    )
    .toBe(true);
  const speak = async (text: string, final: boolean) =>
    page.evaluate(
      ({ text, final }) => {
        const r = (
          window as unknown as {
            testRecognition: { onresult: (event: unknown) => void };
          }
        ).testRecognition;
        r.onresult({ results: [{ isFinal: final, 0: { transcript: text } }] });
      },
      { text, final },
    );
  await speak("We have not measured retention", false);
  await expect(page.locator(".live-caption")).toHaveText(
    "We have not measured retention",
  );
  await expect(page.getByText("0 / 6 recommended answers")).toBeVisible();
  await speak(
    "We have not measured retention yet. We plan a six-week paid pilot with eight clinics to validate our pricing and renewal assumptions.",
    true,
  );
  await expect(page.getByText("1 / 6 recommended answers")).toBeVisible();
  await page.getByRole("button", { name: "Stop spoken practice" }).click();
  await expect(
    page.getByRole("button", { name: "Start spoken practice" }),
  ).toBeVisible();
});

test("A hardware plan preserves its model and starting cash", async ({
  page,
}) => {
  await page.goto("/analysis/new");
  await page
    .getByRole("button", { name: "Promising idea", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Research, customer & model settings/ })
    .click();
  await page.getByLabel("Revenue model").selectOption("hardware");
  await page.getByLabel("Starting cash (USD)").fill("25000");
  await page.getByRole("button", { name: "Build my analysis" }).click();
  await page.getByRole("tab", { name: "Funding", exact: true }).click();
  await expect(page.getByText("STARTING CASH", { exact: true })).toBeVisible();
  await expect(page.getByText("$25.0K", { exact: true }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Market", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Growth and market structure" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Competitors", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Competitor feature matrix" }),
  ).toBeVisible();
});
