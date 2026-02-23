const rawApiBase = process.env.EXPO_PUBLIC_API_BASE?.trim();

export const API_BASE = rawApiBase && rawApiBase.length > 0
  ? rawApiBase
  : "http://localhost:3000";

export const isProbablyLocalhost =
  API_BASE.includes("localhost") || API_BASE.includes("127.0.0.1");
