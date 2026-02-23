import type { ChatMessage, CheckInDraft, Patient, Risk } from "@/src/types/models";

type LoginResponse = {
  token: string;
  patient: Patient;
};

type CreateCheckinResponse = {
  ok: true;
  checkInId: string;
  risk: Risk;
  alertId?: string;
};

type ListCheckinsParams = {
  from?: string;
  to?: string;
  limit?: number;
};

type ListCheckinsResponse = {
  ok: true;
  checkins: Array<{
    id: string;
    date: string;
    pain: number;
    mood: number;
    createdAt?: string;
  }>;
};

type SendChatResponse = {
  ok: true;
  risk: Risk;
  messages?: {
    user?: ChatMessage;
    assistant?: ChatMessage;
  };
  alertId?: string;
};

type ChatHistoryResponse = {
  ok: true;
  messages: ChatMessage[];
};

export async function login(_accessCode: string): Promise<LoginResponse> {
  throw new Error("Not implemented — Step 3/4/5 will wire this");
}

export async function getMe(): Promise<{ ok: true; patient: Patient }> {
  throw new Error("Not implemented — Step 3/4/5 will wire this");
}

export async function createCheckin(
  _payload: CheckInDraft
): Promise<CreateCheckinResponse> {
  throw new Error("Not implemented — Step 3/4/5 will wire this");
}

export async function listCheckins(
  _params?: ListCheckinsParams
): Promise<ListCheckinsResponse> {
  throw new Error("Not implemented — Step 3/4/5 will wire this");
}

export async function sendChat(_message: string): Promise<SendChatResponse> {
  throw new Error("Not implemented — Step 3/4/5 will wire this");
}

export async function chatHistory(_limit?: number): Promise<ChatHistoryResponse> {
  throw new Error("Not implemented — Step 3/4/5 will wire this");
}
