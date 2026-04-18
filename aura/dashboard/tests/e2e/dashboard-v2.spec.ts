import { expect, test } from "@playwright/test";
import { installMockApi } from "./helpers/mockApi";

test("gated dashboard v2 stays overview-first and routes into the right downstream workbenches", async ({
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
    window.localStorage.setItem(
      "aura_dashboard_v2_gates",
      JSON.stringify({
        shell: false,
        routes: {
          dashboard: true,
          worklist: false,
          communication: false,
          "patient-workspace": false,
          alerts: false,
          insights: false,
          appointments: false,
          settings: false,
        },
      }),
    );
  });

  await page.goto("/dashboard");
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("v2-dashboard-route")).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-status-bar")).toContainText(
    "Service analytics",
  );
  await expect(page.getByTestId("v2-dashboard-summary-strip")).toContainText(
    "Open alerts",
  );
  await expect(page.getByTestId("v2-dashboard-operational-load")).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-schedule-section")).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-signals-section")).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-data-context")).toBeVisible();

  await page
    .getByTestId("v2-dashboard-attention-panel")
    .getByRole("button", { name: "Open alerts" })
    .click();
  await expect(page).toHaveURL(/\/alerts$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("v2-dashboard-route")).toBeVisible();

  await page.getByTestId("v2-dashboard-metric-communication").click();
  await expect(page).toHaveURL(/\/communication$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);

  const safetyItem = page.getByTestId("v2-dashboard-safety-item-event-1");
  await expect(safetyItem).toBeVisible();
  await safetyItem.getByRole("button", { name: "Patient P1" }).click();
  await expect(page).toHaveURL(/\/patients\/p1$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.setViewportSize({ width: 560, height: 900 });
  await page.reload();
  await expect(page.getByTestId("v2-dashboard-route")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Coverage note/i }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Trust note/i })).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await expect(page.getByTestId("v2-dashboard-route")).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
