import CareEvent from "../models/CareEvent";
import CaregiverInvite from "../models/CaregiverInvite";
import type { AuthenticatedCaregiver } from "../types/caregiverAuth";

export type CaregiverInviteStatus = "pending" | "active" | "expired" | "revoked";

export type CaregiverAccessMeta = {
  inviteId: string;
  codeHint: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  relationship: string | null;
  caregiverName: string | null;
  lastAccessedAt: string | null;
  createdAt: string | null;
  status: CaregiverInviteStatus;
};

type CaregiverInviteRecord = Record<string, unknown> & {
  patientId?: unknown;
};

const caregiverAccessSelection = {
  _id: 1,
  patientId: 1,
  codeHint: 1,
  expiresAt: 1,
  usedAt: 1,
  revokedAt: 1,
  relationship: 1,
  caregiverName: 1,
  lastAccessedAt: 1,
  createdAt: 1,
} as const;

function toTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toIsoString(value: unknown): string | null {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

export function getCaregiverInviteStatus(
  invite: CaregiverInviteRecord,
  now = new Date()
): CaregiverInviteStatus {
  if (invite.revokedAt instanceof Date) {
    return "revoked";
  }

  if (!(invite.expiresAt instanceof Date) || invite.expiresAt.getTime() <= now.getTime()) {
    return "expired";
  }

  return invite.usedAt instanceof Date ? "active" : "pending";
}

export function mapCaregiverAccess(
  invite: CaregiverInviteRecord,
  now = new Date()
): CaregiverAccessMeta {
  return {
    inviteId: String(invite._id ?? ""),
    codeHint: typeof invite.codeHint === "string" ? invite.codeHint : "",
    expiresAt: toIsoString(invite.expiresAt) ?? new Date(0).toISOString(),
    usedAt: toIsoString(invite.usedAt),
    revokedAt: toIsoString(invite.revokedAt),
    relationship: toTrimmedString(invite.relationship),
    caregiverName: toTrimmedString(invite.caregiverName),
    lastAccessedAt: toIsoString(invite.lastAccessedAt),
    createdAt: toIsoString(invite.createdAt),
    status: getCaregiverInviteStatus(invite, now),
  };
}

export async function writeCaregiverEvent(
  type: string,
  patientId: string,
  inviteId: string | null,
  payload: Record<string, unknown>
): Promise<void> {
  await CareEvent.create({
    type,
    patientId,
    payload: {
      ...payload,
      inviteId: inviteId ?? undefined,
    },
  });
}

export async function listCaregiverAccessForPatient(
  patientIdInput: string
): Promise<CaregiverAccessMeta[]> {
  const patientId = patientIdInput.trim();
  if (!patientId) {
    return [];
  }

  const now = new Date();
  const items = await CaregiverInvite.find({ patientId })
    .sort({ createdAt: -1 })
    .select(caregiverAccessSelection)
    .lean();

  return items.map((item) => mapCaregiverAccess(item as CaregiverInviteRecord, now));
}

export async function getValidatedCaregiverInvite(
  caregiver: AuthenticatedCaregiver | null | undefined
): Promise<CaregiverAccessMeta | null> {
  const patientId = caregiver?.patientId?.trim();
  const inviteId = caregiver?.inviteId?.trim();
  if (!patientId || !inviteId) {
    return null;
  }

  const now = new Date();
  const invite = await CaregiverInvite.findOne({
    _id: inviteId,
    patientId,
  })
    .select(caregiverAccessSelection)
    .lean();

  if (!invite) {
    return null;
  }

  const mapped = mapCaregiverAccess(invite as CaregiverInviteRecord, now);
  return mapped.status === "revoked" || mapped.status === "expired" ? null : mapped;
}

export async function recordCaregiverSurfaceAccess(options: {
  patientId: string;
  inviteId: string;
  surface: string;
  eventType: string;
}): Promise<CaregiverAccessMeta | null> {
  const patientId = options.patientId.trim();
  const inviteId = options.inviteId.trim();
  if (!patientId || !inviteId) {
    return null;
  }

  const now = new Date();
  const updated = await CaregiverInvite.findOneAndUpdate(
    {
      _id: inviteId,
      patientId,
      revokedAt: null,
      expiresAt: { $gt: now },
    },
    {
      $set: {
        lastAccessedAt: now,
      },
    },
    { new: true }
  )
    .select(caregiverAccessSelection)
    .lean();

  if (!updated) {
    return null;
  }

  await writeCaregiverEvent(options.eventType, patientId, inviteId, {
    surface: options.surface,
    accessedAt: now,
  });

  return mapCaregiverAccess(updated as CaregiverInviteRecord, now);
}
