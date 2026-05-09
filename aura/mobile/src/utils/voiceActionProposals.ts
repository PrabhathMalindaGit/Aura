export type VoiceActionProposalRoute =
  | "/(tabs)/checkin"
  | "/(tabs)/chat"
  | "/exercise-plan"
  | "/appointments"
  | "/safety"
  | "/coping-tools";

export type VoiceActionProposalState =
  | "proposed"
  | "needsReview"
  | "confirmed"
  | "cancelled"
  | "expired"
  | "unsafeBlocked";

export type VoiceActionProposalAllowedAction =
  | {
      type: "open_screen";
      route: VoiceActionProposalRoute;
      screen: VoiceActionProposalScreen;
      label: string;
    }
  | {
      type: "start_guided_checkin_screen";
      route: "/(tabs)/checkin";
      workflow: "guidedCheckin";
      label: string;
    }
  | { type: "go_back"; label: string }
  | { type: "stop_session"; label: string }
  | { type: "stop_reading"; label: string };

export type VoiceActionProposalOnlyAction =
  | {
      type: "draft_checkin_note_only";
      route: "/(tabs)/checkin";
      label: string;
      draftText?: string;
    }
  | {
      type: "draft_message_only";
      route: "/(tabs)/chat";
      label: string;
      draftText?: string;
    }
  | {
      type: "select_appointment_slot";
      route: "/appointments";
      label: string;
    }
  | {
      type: "prepare_hydration_log";
      route: "/hydration";
      label: string;
    }
  | {
      type: "prepare_medication_status";
      route: "/medications";
      label: string;
    }
  | {
      type: "prepare_nutrition_log";
      route: "/nutrition";
      label: string;
    }
  | {
      type: "prepare_exercise_session_completion";
      route: "/exercise-sessions";
      label: string;
    };

export type VoiceActionProposalScreen =
  | "checkin"
  | "chat"
  | "exercisePlan"
  | "appointments"
  | "safety"
  | "copingTools";

export type VoiceActionProposalResult =
  | {
      kind: "allowed";
      state: "proposed";
      detectedIntent: string;
      proposedAction: string;
      reviewReason: string;
      action: VoiceActionProposalAllowedAction;
    }
  | {
      kind: "proposal";
      state: "needsReview";
      detectedIntent: string;
      proposedAction: string;
      reviewReason: string;
      action: VoiceActionProposalOnlyAction;
    }
  | {
      kind: "blocked";
      state: "unsafeBlocked";
      detectedIntent: string;
      proposedAction: string;
      reviewReason: string;
      safeRedirectRoutes: ["/safety", "/(tabs)/checkin", "/(tabs)/chat"];
    }
  | {
      kind: "help";
      state: "proposed";
      detectedIntent: string;
      proposedAction: string;
      reviewReason: string;
      action: { type: "show_voice_help"; label: string };
    }
  | {
      kind: "none";
      state: "cancelled";
      detectedIntent: string;
      proposedAction: string;
      reviewReason: string;
    };

type ScreenTarget = {
  screen: VoiceActionProposalScreen;
  route: VoiceActionProposalRoute;
  aliases: string[];
  label: string;
};

const SAFE_REDIRECT_ROUTES = ["/safety", "/(tabs)/checkin", "/(tabs)/chat"] as const;

const BLOCKED_MESSAGE =
  "This cannot be done by voice. You can open Safety, Check-in, or Chat to use Aura's normal review path.";

const ROUTE_REVIEW_REASON =
  "Opening a screen does not submit, send, book, log, or create an alert.";

const PROPOSAL_REVIEW_REASON =
  "This version can prepare a visible proposal only. Review the existing app screen before taking any final action.";

const GUIDED_CHECKIN_REVIEW_REASON =
  "Opening guided Check-in only reveals the optional guided panel. It does not listen, fill answers, save a draft, or submit anything.";

const SCREEN_TARGETS: ScreenTarget[] = [
  {
    screen: "checkin",
    route: "/(tabs)/checkin",
    aliases: ["check-in", "check in", "checkin"],
    label: "Open Check-in",
  },
  {
    screen: "chat",
    route: "/(tabs)/chat",
    aliases: ["chat", "messages"],
    label: "Open Chat",
  },
  {
    screen: "exercisePlan",
    route: "/exercise-plan",
    aliases: ["exercise plan", "exercises"],
    label: "Open Exercise plan",
  },
  {
    screen: "appointments",
    route: "/appointments",
    aliases: ["appointments"],
    label: "Open Appointments",
  },
  {
    screen: "safety",
    route: "/safety",
    aliases: ["safety", "safety guidance", "safety plan"],
    label: "Open Safety",
  },
  {
    screen: "copingTools",
    route: "/coping-tools",
    aliases: ["coping", "coping tools"],
    label: "Open Coping tools",
  },
];

function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .replace(/[']/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\bcheck[\s-]?in\b/g, "check-in")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDetectedIntent(transcript: string): string {
  return transcript.replace(/\s+/g, " ").trim();
}

function hasBlockedIntent(normalized: string): boolean {
  if (!normalized) {
    return false;
  }

  return [
    /\bdiagnos(e|is|ed|ing)\b/,
    /\bdo i have\b/,
    /\btreatment\b/,
    /\bchange\s+(my\s+)?exercise\s+plan\b/,
    /\b(change|adjust)\s+(my\s+)?(medication|medicine|meds)\s+(schedule|time|dose|dosage)\b/,
    /\b(double|increase|reduce|lower|skip)\s+(my\s+)?(medication|medicine|meds|dose|dosage)\b/,
    /\b(dose|dosage)\s+advice\b/,
    /\bsubmit\b/,
    /\bsend\s+(a\s+)?message\b/,
    /\bmessage\s+(my\s+)?(clinician|doctor|therapist|care\s+team)\b/,
    /\bbook\s+(an?\s+)?appointment\b/,
    /\bcancel\s+(my\s+)?appointment\b/,
    /\b(request|schedule)\s+(an?\s+)?appointment\b/,
    /\blog\s+(medication|medicine|meds|hydration|water|nutrition|meal|food)\b/,
    /\bupload\s+(a\s+)?(photo|picture|image)\b/,
    /\b(hidden|silent|silently|without telling me)\b.*\b(alert|submit|send|book|log)\b/,
    /\b(create|make|raise)\s+(an?\s+)?(hidden\s+)?alert\b/,
    /\b(call|dial)\s+(emergency|911|999|112|ambulance)\b/,
    /\b(emergency|chest pain|cannot breathe|cant breathe|unsafe|urgent)\b/,
    /\bbypass\s+(the\s+)?safety\s+router\b/,
    /\bsafety\s+router\s+bypass\b/,
    /\boverride\s+(my\s+)?clinician\b/,
    /\b(suppress|ignore|hide)\s+(the\s+)?alert\b/,
  ].some((pattern) => pattern.test(normalized));
}

function createBlockedResult(detectedIntent: string): VoiceActionProposalResult {
  return {
    kind: "blocked",
    state: "unsafeBlocked",
    detectedIntent,
    proposedAction: "Use Aura's normal review path",
    reviewReason: BLOCKED_MESSAGE,
    safeRedirectRoutes: [...SAFE_REDIRECT_ROUTES],
  };
}

function createNoneResult(detectedIntent: string): VoiceActionProposalResult {
  return {
    kind: "none",
    state: "cancelled",
    detectedIntent,
    proposedAction: "No safe action detected",
    reviewReason: "Try Voice help to hear supported actions.",
  };
}

function parseOpenScreen(normalized: string, detectedIntent: string): VoiceActionProposalResult | null {
  const prefixes = ["open", "go to", "show", "take me to"];
  for (const prefix of prefixes) {
    const prefixWithSpace = `${prefix} `;
    if (!normalized.startsWith(prefixWithSpace)) {
      continue;
    }

    const targetText = normalized.slice(prefixWithSpace.length).trim();
    const target = SCREEN_TARGETS.find((item) => item.aliases.includes(targetText));
    if (!target) {
      return null;
    }

    return {
      kind: "allowed",
      state: "proposed",
      detectedIntent,
      proposedAction: target.label,
      reviewReason: ROUTE_REVIEW_REASON,
      action: {
        type: "open_screen",
        route: target.route,
        screen: target.screen,
        label: target.label,
      },
    };
  }

  return null;
}

function parseWorkflowStart(normalized: string, detectedIntent: string): VoiceActionProposalResult | null {
  if (!/\b(start|begin|open)\s+(guided\s+)?check-in\b/.test(normalized)) {
    return null;
  }

  return {
    kind: "allowed",
    state: "proposed",
    detectedIntent,
    proposedAction: "Start guided Check-in",
    reviewReason: GUIDED_CHECKIN_REVIEW_REASON,
    action: {
      type: "start_guided_checkin_screen",
      route: "/(tabs)/checkin",
      workflow: "guidedCheckin",
      label: "Start guided Check-in",
    },
  };
}

function extractDraftText(transcript: string): string | undefined {
  const cleaned = cleanDetectedIntent(transcript);
  const match = cleaned.match(
    /(?:draft(?: a)?(?: check-in)?(?: note| message)?|add(?: to)?(?: my)? check-in note|write(?: a)?(?: note| message)?)(?::|\s+(?:saying|that|as))?\s+(.+)$/i,
  );

  return match?.[1]?.replace(/^(note|message):\s*/i, "").trim() || undefined;
}

function createProposal(
  detectedIntent: string,
  action: VoiceActionProposalOnlyAction,
): VoiceActionProposalResult {
  return {
    kind: "proposal",
    state: "needsReview",
    detectedIntent,
    proposedAction: action.label,
    reviewReason: PROPOSAL_REVIEW_REASON,
    action,
  };
}

function parseProposalOnly(
  normalized: string,
  transcript: string,
  detectedIntent: string,
): VoiceActionProposalResult | null {
  if (/\b(draft|add|write)\b.*\bcheck-in\b.*\b(note|notes)\b/.test(normalized)) {
    return createProposal(detectedIntent, {
      type: "draft_checkin_note_only",
      route: "/(tabs)/checkin",
      label: "Prepare a check-in note draft",
      draftText: extractDraftText(transcript),
    });
  }

  if (/\b(draft|write|prepare)\b.*\b(message|chat)\b/.test(normalized)) {
    return createProposal(detectedIntent, {
      type: "draft_message_only",
      route: "/(tabs)/chat",
      label: "Prepare a chat draft",
      draftText: extractDraftText(transcript),
    });
  }

  if (/\b(select|choose|pick)\b.*\bappointment\b.*\b(slot|time)\b/.test(normalized)) {
    return createProposal(detectedIntent, {
      type: "select_appointment_slot",
      route: "/appointments",
      label: "Open appointments to review slots",
    });
  }

  if (/\bprepare\b.*\bhydration\b.*\blog\b/.test(normalized)) {
    return createProposal(detectedIntent, {
      type: "prepare_hydration_log",
      route: "/hydration",
      label: "Open hydration for manual review",
    });
  }

  if (/\bprepare\b.*\b(medication|medicine|meds)\b.*\b(status|taken|missed|skipped)\b/.test(normalized)) {
    return createProposal(detectedIntent, {
      type: "prepare_medication_status",
      route: "/medications",
      label: "Open medications for manual review",
    });
  }

  if (/\bprepare\b.*\bnutrition\b.*\blog\b/.test(normalized)) {
    return createProposal(detectedIntent, {
      type: "prepare_nutrition_log",
      route: "/nutrition",
      label: "Open nutrition for manual review",
    });
  }

  if (/\bprepare\b.*\bexercise\b.*\b(session\s+)?completion\b/.test(normalized)) {
    return createProposal(detectedIntent, {
      type: "prepare_exercise_session_completion",
      route: "/exercise-sessions",
      label: "Open exercise sessions for manual review",
    });
  }

  return null;
}

export function parseVoiceActionProposal(transcript: string): VoiceActionProposalResult {
  const detectedIntent = cleanDetectedIntent(transcript);
  const normalized = normalizeTranscript(transcript);

  if (!detectedIntent || !normalized) {
    return createNoneResult(detectedIntent);
  }

  if (hasBlockedIntent(normalized)) {
    return createBlockedResult(detectedIntent);
  }

  if (normalized === "voice help" || normalized === "help" || normalized === "explain voice help") {
    return {
      kind: "help",
      state: "proposed",
      detectedIntent,
      proposedAction: "Show Voice help",
      reviewReason: "Voice help only explains supported actions. It does not submit or send anything.",
      action: {
        type: "show_voice_help",
        label: "Show Voice help",
      },
    };
  }

  if (normalized === "go back") {
    return {
      kind: "allowed",
      state: "proposed",
      detectedIntent,
      proposedAction: "Go back",
      reviewReason: "Going back only changes the current screen.",
      action: { type: "go_back", label: "Go back" },
    };
  }

  if (normalized === "stop voice session" || normalized === "stop session" || normalized === "stop voice agent") {
    return {
      kind: "allowed",
      state: "proposed",
      detectedIntent,
      proposedAction: "Stop Voice Agent",
      reviewReason: "Stopping clears the temporary browser voice session from memory.",
      action: { type: "stop_session", label: "Stop Voice Agent" },
    };
  }

  if (normalized === "stop reading") {
    return {
      kind: "allowed",
      state: "proposed",
      detectedIntent,
      proposedAction: "Stop read-aloud",
      reviewReason: "Stopping read-aloud does not change your care data.",
      action: { type: "stop_reading", label: "Stop reading" },
    };
  }

  return (
    parseOpenScreen(normalized, detectedIntent) ??
    parseWorkflowStart(normalized, detectedIntent) ??
    parseProposalOnly(normalized, transcript, detectedIntent) ??
    createNoneResult(detectedIntent)
  );
}
