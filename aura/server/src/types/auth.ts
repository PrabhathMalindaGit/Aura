import { Request } from "express";

export type UserRole = "clinician" | "admin" | "patient";

export type AuthUser = {
  id: string;
  role: UserRole;
  email: string;
  name?: string;
  sessionVersion: number;
};

export type RequestWithUser = Request & {
  user?: AuthUser;
};
