export const BODY_MAP_REGIONS = [
  "head",
  "neck",
  "shoulder_left",
  "shoulder_right",
  "upper_back",
  "lower_back",
  "arm_left",
  "arm_right",
  "elbow_left",
  "elbow_right",
  "wrist_hand_left",
  "wrist_hand_right",
  "hip_left",
  "hip_right",
  "knee_left",
  "knee_right",
  "ankle_foot_left",
  "ankle_foot_right",
] as const;

export type BodyMapRegion = (typeof BODY_MAP_REGIONS)[number];

export const BODY_MAP_PAIN_TYPES = [
  "ache",
  "sharp",
  "burning",
  "tingling",
  "stiffness",
  "other",
] as const;

export type BodyMapPainType = (typeof BODY_MAP_PAIN_TYPES)[number];

const REGION_LABELS: Record<BodyMapRegion, string> = {
  head: "Head",
  neck: "Neck",
  shoulder_left: "Left shoulder",
  shoulder_right: "Right shoulder",
  upper_back: "Upper back",
  lower_back: "Lower back",
  arm_left: "Left arm",
  arm_right: "Right arm",
  elbow_left: "Left elbow",
  elbow_right: "Right elbow",
  wrist_hand_left: "Left wrist/hand",
  wrist_hand_right: "Right wrist/hand",
  hip_left: "Left hip",
  hip_right: "Right hip",
  knee_left: "Left knee",
  knee_right: "Right knee",
  ankle_foot_left: "Left ankle/foot",
  ankle_foot_right: "Right ankle/foot",
};

const REGION_SET = new Set<string>(BODY_MAP_REGIONS);
const PAIN_TYPE_SET = new Set<string>(BODY_MAP_PAIN_TYPES);

export function isBodyMapRegion(value: unknown): value is BodyMapRegion {
  return typeof value === "string" && REGION_SET.has(value);
}

export function isBodyMapPainType(value: unknown): value is BodyMapPainType {
  return typeof value === "string" && PAIN_TYPE_SET.has(value);
}

export function bodyMapRegionLabel(value: string): string {
  return (REGION_LABELS as Record<string, string>)[value] ?? value;
}
