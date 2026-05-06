export type VoiceCommandRoute =
  | "/(tabs)"
  | "/(tabs)/checkin"
  | "/(tabs)/chat"
  | "/(tabs)/progress"
  | "/exercise-plan"
  | "/appointments"
  | "/reminders"
  | "/safety"
  | "/coping-tools"
  | "/hydration"
  | "/medications"
  | "/symptom-photos"
  | "/caregiver-invite";

export type VoiceCommandResult =
  | {
      type: "navigation";
      command: string;
      route: VoiceCommandRoute;
    }
  | {
      type: "goBack";
      command: "go back";
    }
  | {
      type: "stopReading";
      command: "stop reading";
    }
  | {
      type: "help";
      command: "help";
    }
  | {
      type: "unsupported";
      reason: "unsafe" | "unknown";
    };

type VoiceCommandTarget = {
  command: string;
  route: VoiceCommandRoute;
  aliases: string[];
};

const NAVIGATION_PREFIXES = ["open", "go to", "show", "take me to"] as const;

const COMMAND_TARGETS: VoiceCommandTarget[] = [
  { command: "open home", route: "/(tabs)", aliases: ["home", "today"] },
  {
    command: "open check-in",
    route: "/(tabs)/checkin",
    aliases: ["check-in", "check in", "checkin"],
  },
  { command: "open chat", route: "/(tabs)/chat", aliases: ["chat", "messages"] },
  { command: "open progress", route: "/(tabs)/progress", aliases: ["progress"] },
  {
    command: "open exercise plan",
    route: "/exercise-plan",
    aliases: ["exercise plan", "exercises"],
  },
  { command: "open appointments", route: "/appointments", aliases: ["appointments"] },
  { command: "open reminders", route: "/reminders", aliases: ["reminders"] },
  {
    command: "open safety guidance",
    route: "/safety",
    aliases: ["safety guidance", "safety", "safety plan"],
  },
  { command: "open coping tools", route: "/coping-tools", aliases: ["coping tools", "coping"] },
  { command: "open hydration", route: "/hydration", aliases: ["hydration", "water"] },
  { command: "open medications", route: "/medications", aliases: ["medications", "medicine", "meds"] },
  {
    command: "open symptom photos",
    route: "/symptom-photos",
    aliases: ["symptom photos", "photos"],
  },
  { command: "open caregiver", route: "/caregiver-invite", aliases: ["caregiver", "caregiver access"] },
];

export const SUPPORTED_VOICE_COMMANDS = [
  "Open home",
  "Open check-in",
  "Open chat",
  "Open progress",
  "Open exercise plan",
  "Open appointments",
  "Open reminders",
  "Open safety guidance",
  "Open coping tools",
  "Open hydration",
  "Open medications",
  "Open symptom photos",
  "Open caregiver",
  "Go back",
  "Stop reading",
  "Help",
] as const;

function normalizeVoiceCommand(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\bcheck[\s-]?in\b/g, "check-in")
    .replace(/\s+/g, " ")
    .trim();
}

function isUnsafeCommand(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  return [
    /\bsubmit\b/,
    /\bsend\s+message\b/,
    /\bbook\s+appointment\b/,
    /\bcancel\s+appointment\b/,
    /\blog\s+(medication|medicine|meds|hydration|water|nutrition|meal|food)\b/,
    /\bupload\s+(photo|picture|image)\b/,
    /\bcall\s+(emergency|911|999|112|ambulance)\b/,
    /\bmessage\s+(clinician|doctor|therapist|care\s+team)\b/,
    /\bset\s+pain\s+level\b/,
  ].some((pattern) => pattern.test(normalized));
}

function parseNavigation(normalized: string): VoiceCommandResult | null {
  for (const prefix of NAVIGATION_PREFIXES) {
    const prefixWithSpace = `${prefix} `;
    if (!normalized.startsWith(prefixWithSpace)) {
      continue;
    }

    const targetText = normalized.slice(prefixWithSpace.length).trim();
    for (const target of COMMAND_TARGETS) {
      if (target.aliases.includes(targetText)) {
        return {
          type: "navigation",
          command: target.command,
          route: target.route,
        };
      }
    }
  }

  return null;
}

export function parseVoiceCommand(transcript: string): VoiceCommandResult {
  const normalized = normalizeVoiceCommand(transcript);

  if (isUnsafeCommand(normalized)) {
    return { type: "unsupported", reason: "unsafe" };
  }

  if (normalized === "go back") {
    return { type: "goBack", command: "go back" };
  }

  if (normalized === "stop reading") {
    return { type: "stopReading", command: "stop reading" };
  }

  if (normalized === "help") {
    return { type: "help", command: "help" };
  }

  const navigation = parseNavigation(normalized);
  if (navigation) {
    return navigation;
  }

  return { type: "unsupported", reason: "unknown" };
}
