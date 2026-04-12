import CommunicationEvent, {
  type CommunicationActorType,
  type CommunicationChannel,
  type CommunicationEventType,
} from "../models/CommunicationEvent";

const THREAD_OPEN_DEBOUNCE_MS = 5 * 60 * 1000;

export type CommunicationActorInput = {
  actorType: CommunicationActorType;
  actorId?: string;
  actorDisplayName?: string;
};

export type RecordCommunicationEventInput = {
  patientId: string;
  threadKey: string;
  channel?: CommunicationChannel;
  messageId?: string;
  eventType: CommunicationEventType;
  actorType: CommunicationActorType;
  actorId?: string;
  actorDisplayName?: string;
  sourceSurface: string;
  sourceRecordId?: string;
  createdAt?: Date;
};

function normalizeTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeActor(
  actor: CommunicationActorInput
): CommunicationActorInput {
  return {
    actorType: actor.actorType,
    actorId: normalizeTrimmed(actor.actorId),
    actorDisplayName: normalizeTrimmed(actor.actorDisplayName),
  };
}

export function buildCommunicationThreadKey(
  patientId: string,
  channel: CommunicationChannel = "patient_chat"
): string {
  return `${channel}:${patientId.trim()}`;
}

export async function recordCommunicationEvent(
  input: RecordCommunicationEventInput
): Promise<void> {
  await CommunicationEvent.create({
    patientId: input.patientId.trim(),
    threadKey: input.threadKey.trim(),
    channel: input.channel ?? "patient_chat",
    messageId: normalizeTrimmed(input.messageId),
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: normalizeTrimmed(input.actorId),
    actorDisplayName: normalizeTrimmed(input.actorDisplayName),
    sourceSurface: input.sourceSurface.trim(),
    sourceRecordId: normalizeTrimmed(input.sourceRecordId),
    createdAt: input.createdAt ?? new Date(),
  });
}

async function hasMatchingEvent(input: {
  patientId: string;
  messageId?: string;
  eventType: CommunicationEventType;
  actorType: CommunicationActorType;
  actorId?: string;
  sourceSurface: string;
  sourceRecordId?: string;
}): Promise<boolean> {
  const existing = await CommunicationEvent.findOne({
    patientId: input.patientId.trim(),
    eventType: input.eventType,
    actorType: input.actorType,
    actorId: normalizeTrimmed(input.actorId),
    sourceSurface: input.sourceSurface.trim(),
    sourceRecordId: normalizeTrimmed(input.sourceRecordId),
    ...(normalizeTrimmed(input.messageId)
      ? { messageId: normalizeTrimmed(input.messageId) }
      : {}),
  })
    .select({ _id: 1 })
    .lean();

  return Boolean(existing);
}

export async function recordPatientMessageSentEvent(input: {
  patientId: string;
  messageId: string;
  createdAt?: Date;
}): Promise<void> {
  if (
    await hasMatchingEvent({
      patientId: input.patientId,
      messageId: input.messageId,
      eventType: "patient_message_sent",
      actorType: "patient",
      sourceSurface: "patient_chat",
      sourceRecordId: input.messageId,
    })
  ) {
    return;
  }

  await recordCommunicationEvent({
    patientId: input.patientId,
    threadKey: buildCommunicationThreadKey(input.patientId),
    channel: "patient_chat",
    messageId: input.messageId,
    eventType: "patient_message_sent",
    actorType: "patient",
    sourceSurface: "patient_chat",
    sourceRecordId: input.messageId,
    createdAt: input.createdAt,
  });
}

export async function recordThreadOpenedEvent(input: {
  patientId: string;
  actor: CommunicationActorInput;
  sourceSurface: string;
  createdAt?: Date;
}): Promise<void> {
  const actor = normalizeActor(input.actor);
  const createdAt = input.createdAt ?? new Date();
  const recent = await CommunicationEvent.findOne({
    patientId: input.patientId.trim(),
    threadKey: buildCommunicationThreadKey(input.patientId),
    eventType: "thread_opened",
    actorType: actor.actorType,
    actorId: actor.actorId,
    sourceSurface: input.sourceSurface.trim(),
    createdAt: {
      $gte: new Date(createdAt.getTime() - THREAD_OPEN_DEBOUNCE_MS),
    },
  })
    .sort({ createdAt: -1 })
    .select({ _id: 1 })
    .lean();

  if (recent) {
    return;
  }

  await recordCommunicationEvent({
    patientId: input.patientId,
    threadKey: buildCommunicationThreadKey(input.patientId),
    channel: "patient_chat",
    eventType: "thread_opened",
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorDisplayName: actor.actorDisplayName,
    sourceSurface: input.sourceSurface,
    createdAt,
  });
}

export async function recordReviewRecordedEvent(input: {
  patientId: string;
  messageId: string;
  actor: CommunicationActorInput;
  sourceSurface: string;
  sourceRecordId?: string;
  createdAt?: Date;
}): Promise<void> {
  const actor = normalizeActor(input.actor);
  if (
    await hasMatchingEvent({
      patientId: input.patientId,
      messageId: input.messageId,
      eventType: "review_recorded",
      actorType: actor.actorType,
      actorId: actor.actorId,
      sourceSurface: input.sourceSurface,
      sourceRecordId: input.sourceRecordId,
    })
  ) {
    return;
  }

  await recordCommunicationEvent({
    patientId: input.patientId,
    threadKey: buildCommunicationThreadKey(input.patientId),
    channel: "patient_chat",
    messageId: input.messageId,
    eventType: "review_recorded",
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorDisplayName: actor.actorDisplayName,
    sourceSurface: input.sourceSurface,
    sourceRecordId: input.sourceRecordId,
    createdAt: input.createdAt,
  });
}

export async function recordFollowUpRequestedEvent(input: {
  patientId: string;
  messageId: string;
  actor: CommunicationActorInput;
  sourceSurface: string;
  sourceRecordId?: string;
  createdAt?: Date;
}): Promise<void> {
  const actor = normalizeActor(input.actor);
  if (
    await hasMatchingEvent({
      patientId: input.patientId,
      messageId: input.messageId,
      eventType: "follow_up_requested",
      actorType: actor.actorType,
      actorId: actor.actorId,
      sourceSurface: input.sourceSurface,
      sourceRecordId: input.sourceRecordId,
    })
  ) {
    return;
  }

  await recordCommunicationEvent({
    patientId: input.patientId,
    threadKey: buildCommunicationThreadKey(input.patientId),
    channel: "patient_chat",
    messageId: input.messageId,
    eventType: "follow_up_requested",
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorDisplayName: actor.actorDisplayName,
    sourceSurface: input.sourceSurface,
    sourceRecordId: input.sourceRecordId,
    createdAt: input.createdAt,
  });
}

export async function recordResolvedNoFollowUpEvent(input: {
  patientId: string;
  messageId: string;
  actor: CommunicationActorInput;
  sourceSurface: string;
  sourceRecordId?: string;
  createdAt?: Date;
}): Promise<void> {
  const actor = normalizeActor(input.actor);
  if (
    await hasMatchingEvent({
      patientId: input.patientId,
      messageId: input.messageId,
      eventType: "resolved_no_follow_up",
      actorType: actor.actorType,
      actorId: actor.actorId,
      sourceSurface: input.sourceSurface,
      sourceRecordId: input.sourceRecordId,
    })
  ) {
    return;
  }

  await recordCommunicationEvent({
    patientId: input.patientId,
    threadKey: buildCommunicationThreadKey(input.patientId),
    channel: "patient_chat",
    messageId: input.messageId,
    eventType: "resolved_no_follow_up",
    actorType: actor.actorType,
    actorId: actor.actorId,
    actorDisplayName: actor.actorDisplayName,
    sourceSurface: input.sourceSurface,
    sourceRecordId: input.sourceRecordId,
    createdAt: input.createdAt,
  });
}
