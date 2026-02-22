import type { Locator, Page } from '@playwright/test';

interface ClickCounter {
  clickByTestId: (testId: string) => Promise<void>;
  clickLocator: (locator: Locator) => Promise<void>;
  getCount: () => number;
}

export function createClickCounter(page: Page): ClickCounter {
  let count = 0;

  return {
    clickByTestId: async (testId: string): Promise<void> => {
      count += 1;
      await page.getByTestId(testId).click();
    },
    clickLocator: async (locator: Locator): Promise<void> => {
      count += 1;
      await locator.click();
    },
    getCount: (): number => count,
  };
}
