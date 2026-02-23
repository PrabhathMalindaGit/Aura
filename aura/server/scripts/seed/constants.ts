export const DEMO_TAG = "demo-v1";
export const RNG_SEED = 1337;
export const CHECKIN_WINDOW_DAYS = 30;
export const CHAT_MESSAGES_PER_PATIENT = 10;

export const CLINICIANS = {
  one: {
    id: "clinician-1",
    name: "Clinician One",
  },
  two: {
    id: "clinician-2",
    name: "Clinician Two",
  },
} as const;

export const DEMO_PATIENTS = [
  {
    patientId: "p1",
    displayName: "Patient One",
    accessCode: "P1-DEMO",
    status: "active",
    clinicianId: CLINICIANS.one.id,
  },
  {
    patientId: "p2",
    displayName: "Patient Two",
    accessCode: "P2-DEMO",
    status: "on_hold",
    clinicianId: CLINICIANS.one.id,
  },
  {
    patientId: "p3",
    displayName: "Patient Three",
    accessCode: "P3-DEMO",
    status: "discharged",
    clinicianId: CLINICIANS.two.id,
  },
] as const;

export const DEMO_CLINICIAN_USERS = [
  {
    email: "clinician1@example.com",
    password: "devpass123",
    displayName: "Clinician One",
    role: "clinician",
  },
  {
    email: "clinician2@example.com",
    password: "devpass123",
    displayName: "Clinician Two",
    role: "clinician",
  },
] as const;

export const USER_CHAT_TEXTS = [
  "Knee feels tight after a short walk.",
  "Morning stiffness improved today.",
  "Movement feels smoother than yesterday.",
  "Mild ache when climbing stairs.",
  "Energy level feels steady.",
] as const;

export const ASSISTANT_CHAT_TEXTS = [
  "Thanks for the update. Keep sessions paced.",
  "Noted. Continue hydration and gentle movement.",
  "Good progress. Maintain the same routine.",
  "Please log symptoms after activity blocks.",
  "Understood. Continue with the plan.",
] as const;
