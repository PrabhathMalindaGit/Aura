import { expect, test } from "@playwright/test";
import { installMockApi } from "./helpers/mockApi";

test("gated settings v2 keeps grouped preferences calm while preserving local save and immediate behaviors", async ({
  page,
}) => {
  const runtimeIssues: string[] = [];

  page.on("pageerror", (error) => {
    runtimeIssues.push(`pageerror: ${error.stack ?? error.message}`);
  });

  page.on("console", (message) => {
    const text = message.text();
    if (
      message.type() === "error" &&
      !text.includes("Failed to load resource") &&
      !text.includes("Failed to fetch") &&
      !text.includes("ERR_INTERNET_DISCONNECTED")
    ) {
      runtimeIssues.push(`console:${message.type()}: ${text}`);
    }
  });

  await installMockApi(page);

  await page.addInitScript(() => {
    const toBase64Url = (value: string) =>
      btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    const token = `${toBase64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }))}.${toBase64Url(
      JSON.stringify({
        sub: "auth-settings-e2e",
        name: "Dr E2E",
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      }),
    )}.signature`;

    window.localStorage.setItem("aura_access_token", token);
    window.localStorage.setItem(
      "aura_dashboard_v2_gates",
      JSON.stringify({
        shell: false,
        routes: {
          dashboard: false,
          worklist: false,
          communication: false,
          "patient-workspace": false,
          alerts: false,
          insights: false,
          appointments: false,
          settings: true,
        },
      }),
    );
  });

  await page.goto("/settings");
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);

  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByTestId("v2-settings-route")).toBeVisible();
  await expect(page.getByTestId("v2-settings-profile-section")).toContainText(
    "Workspace profile",
  );
  await expect(
    page.getByTestId("v2-settings-maintenance-panel"),
  ).toContainText("Restore workspace profile defaults");

  await page.getByLabel("Clinician display name").fill("Dr QA Rivera");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Settings saved in this browser.")).toBeVisible();

  await page.getByRole("button", { name: "Add template" }).click();
  await page.getByLabel("Template 1 title").fill("Reviewed");
  await page.getByLabel("Template 1 body").fill("Thanks, I have reviewed this update.");
  await page.getByRole("button", { name: "Save communication settings" }).click();
  await expect(page.getByText("1 saved template")).toBeVisible();

  await page.getByRole("checkbox", { name: /Quiet hours/i }).click();
  await page.getByLabel("Quiet hours start time").fill("22:00");
  await page.getByLabel("Quiet hours end time").fill("22:00");
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await expect(
    page.getByText("Quiet hours start and end times must be different.").first(),
  ).toBeVisible();

  await page.getByLabel("Quiet hours end time").fill("06:45");
  await page.getByRole("button", { name: "Save notification settings" }).click();
  await expect(page.getByText("Quiet hours 22:00 - 06:45")).toBeVisible();

  await page.getByRole("radio", { name: "Dark" }).click();
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("aura_theme_mode")))
    .toBe("dark");

  await page.getByRole("button", { name: "Restore defaults" }).click();
  await expect(
    page.getByText("Defaults restored in the form. Save to keep them in this browser."),
  ).toBeVisible();

  await page.setViewportSize({ width: 560, height: 900 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Shared shell state/i }),
  ).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
