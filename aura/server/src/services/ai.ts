import axios from "axios";

import { env } from "../env";
import { logger } from "../utils/logger";

export type ClassifyInput = {
  type: "checkin" | "chat";
  pain?: number;
  text?: string;
};

export type ClassifyOutput = {
  risk: "low" | "high";
  reasons: string[];
};

export class AIUnavailableError extends Error {
  constructor(message = "AI service unavailable") {
    super(message);
    this.name = "AIUnavailableError";
  }
}

export async function classify(input: ClassifyInput): Promise<ClassifyOutput> {
  try {
    const response = await axios.post(`${env.AI_BASE_URL}/classify`, input, {
      timeout: 4000,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const risk = response?.data?.risk === "high" ? "high" : "low";
    const reasons = Array.isArray(response?.data?.reasons)
      ? response.data.reasons.filter((item: unknown) => typeof item === "string")
      : [];

    return { risk, reasons };
  } catch (error) {
    logger.error("AI classify request failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw new AIUnavailableError();
  }
}
