import { afterEach, beforeEach, vi } from "vitest";

const asyncStorageState = new Map<string, string>();
(globalThis as any).__DEV__ = false;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: vi.fn(async (key: string) =>
      asyncStorageState.has(key) ? asyncStorageState.get(key) ?? null : null
    ),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageState.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageState.delete(key);
    }),
    clear: vi.fn(async () => {
      asyncStorageState.clear();
    }),
  },
}));

beforeEach(() => {
  asyncStorageState.clear();
});

afterEach(() => {
  asyncStorageState.clear();
});
