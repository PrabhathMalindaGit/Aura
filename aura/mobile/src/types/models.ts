export type Patient = {
  id: string;
  displayName?: string;
};

export type Risk = {
  level: "low" | "high";
  reasonCodes?: string[];
};

export type CheckInDraft = {
  date: string;
  mood: number;
  pain: number;
  adherence: {
    exercises: number;
    medication: boolean;
  };
  notes?: string;
};

export type ChatMessage = {
  id?: string;
  role: "patient" | "assistant" | "system";
  text: string;
  createdAt?: string;
};
