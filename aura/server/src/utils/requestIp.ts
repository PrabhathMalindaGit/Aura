import { Request } from "express";

export function getRequestIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  if (Array.isArray(forwarded) && forwarded.length > 0) {
    const first = forwarded[0];
    if (typeof first === "string" && first.trim()) {
      return first.trim();
    }
  }

  return req.ip || "unknown";
}
