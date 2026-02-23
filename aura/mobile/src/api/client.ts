export type ApiError = {
  message: string;
  status?: number;
};

type ApiFetchOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiFetch<T>(
  _path: string,
  _options?: ApiFetchOptions
): Promise<T> {
  throw new Error("apiFetch not wired yet — implement in Step 3");
}
