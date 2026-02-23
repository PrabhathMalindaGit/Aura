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

export const DEMO_EXERCISE_PLANS = [
  {
    patientId: "p1",
    title: "Lower limb strengthening",
    daysOfWeek: [1, 3, 5],
    items: [
      {
        key: "quad-set-1",
        name: "Quad set",
        instructions: "Tighten your thigh muscle and hold before relaxing.",
        sets: 3,
        reps: 12,
        holdSeconds: 5,
        restSeconds: 30,
        intensity: "moderate",
        order: 1,
        videoUrl: "https://example.com/videos/quad-set",
      },
      {
        key: "heel-slide-1",
        name: "Heel slide",
        instructions: "Slide your heel toward your body while keeping motion smooth.",
        sets: 3,
        reps: 10,
        restSeconds: 30,
        intensity: "easy",
        order: 2,
      },
      {
        key: "bridge-1",
        name: "Bridge",
        instructions: "Lift hips from the bed and lower with control.",
        sets: 2,
        reps: 10,
        restSeconds: 45,
        intensity: "moderate",
        order: 3,
      },
    ],
  },
  {
    patientId: "p2",
    title: "Mobility and balance",
    daysOfWeek: [2, 4, 6],
    items: [
      {
        key: "ankle-pump-1",
        name: "Ankle pump",
        instructions: "Alternate pointing and flexing your foot.",
        sets: 3,
        reps: 15,
        restSeconds: 20,
        intensity: "easy",
        order: 1,
      },
      {
        key: "sit-stand-1",
        name: "Sit to stand",
        instructions: "Stand up from a chair and sit down slowly.",
        sets: 3,
        reps: 8,
        restSeconds: 45,
        intensity: "hard",
        order: 2,
        videoUrl: "https://example.com/videos/sit-to-stand",
      },
      {
        key: "side-step-1",
        name: "Side stepping",
        instructions: "Take small side steps while maintaining posture.",
        sets: 2,
        reps: 12,
        restSeconds: 40,
        intensity: "moderate",
        order: 3,
      },
    ],
  },
  {
    patientId: "p3",
    title: "Daily conditioning",
    daysOfWeek: [1, 2, 3, 4, 5],
    items: [
      {
        key: "march-1",
        name: "Seated march",
        instructions: "Lift knees one at a time while seated upright.",
        sets: 3,
        reps: 12,
        restSeconds: 30,
        intensity: "easy",
        order: 1,
      },
      {
        key: "calf-raise-1",
        name: "Calf raise",
        instructions: "Raise heels and lower slowly while holding support.",
        sets: 3,
        reps: 10,
        restSeconds: 40,
        intensity: "moderate",
        order: 2,
      },
      {
        key: "hamstring-stretch-1",
        name: "Hamstring stretch",
        instructions: "Stretch gently and hold within comfortable range.",
        sets: 2,
        reps: 6,
        holdSeconds: 20,
        restSeconds: 30,
        intensity: "easy",
        order: 3,
      },
    ],
  },
] as const;
