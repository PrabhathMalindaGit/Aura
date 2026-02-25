import { Request } from "express";

export type AuthenticatedCaregiver = {
  patientId: string;
  inviteId: string;
};

export type RequestWithCaregiver = Request & {
  caregiver?: AuthenticatedCaregiver;
};
