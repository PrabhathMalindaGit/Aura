import { expect, test } from "@playwright/test";
import { installMockApi } from "./helpers/mockApi";

test("dashboard v2 stays overview-first and routes into the right downstream workbenches by default", async ({
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

  await page.goto("/dashboard");
  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);

  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Today", level: 1 })).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-route")).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-attention-panel")).toContainText(
    "Priority now",
  );
  await expect(page.getByTestId("v2-dashboard-summary-strip")).toContainText(
    "Operational summary",
  );
  await expect(page.getByTestId("v2-dashboard-urgent-queue")).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-signals-section")).toBeVisible();
  await expect(page.getByTestId("v2-dashboard-data-context")).toContainText(
    "Review window",
  );
  await expect(page.getByTestId("v2-dashboard-data-context")).toContainText(
    "Schedule:",
  );
  await expect(
    page
      .getByTestId("v2-dashboard-data-context")
      .getByRole("button", { name: "Open schedule" }),
  ).toBeVisible();

  await page
    .getByTestId("v2-dashboard-attention-panel")
    .getByRole("button", { name: "Open alerts" })
    .click();
  await expect(page).toHaveURL(/\/alerts$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByTestId("v2-dashboard-route")).toBeVisible();

  await page
    .getByTestId("v2-dashboard-metric-communication")
    .getByRole("button", { name: "Open inbox" })
    .click();
  await expect(page).toHaveURL(/\/communication$/);

  await page.goBack();
  await expect(page).toHaveURL(/\/dashboard$/);

  const safetyItem = page.getByTestId("v2-dashboard-safety-item-event-1");
  await expect(safetyItem).toBeVisible();
  await safetyItem.getByRole("button", { name: "Patient P1" }).click();
  await expect(page).toHaveURL(/\/patients\/p1$/);
  await expect(page.getByTestId("v2-patient-workspace-route")).toBeVisible();
  await expect(page.getByTestId("v2-patient-return-link")).toContainText(
    "Return to Dashboard",
  );
  await expect(page.getByText("Opened from Dashboard")).toBeVisible();
  await page.getByTestId("v2-patient-return-link").click();
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.setViewportSize({ width: 560, height: 900 });
  await page.reload();
  await expect(page.getByTestId("v2-dashboard-route")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /About this data/i }),
  ).toBeVisible();

  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "dark");
  });
  await expect(page.getByTestId("v2-dashboard-route")).toBeVisible();

  expect(runtimeIssues, runtimeIssues.join("\n")).toEqual([]);
});
