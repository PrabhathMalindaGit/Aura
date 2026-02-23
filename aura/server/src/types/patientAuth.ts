import { Request } from "express";

export type AuthenticatedPatient = {
  id: string;
  displayName?: string;
};

export type RequestWithPatient = Request & {
  patient?: AuthenticatedPatient;
};
