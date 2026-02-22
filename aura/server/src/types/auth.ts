import { Request } from "express";

export type UserRole = "clinician" | "admin" | "patient";

export type AuthUser = {
  id: string;
  role: UserRole;
  email: string;
  name?: string;
};

export type RequestWithUser = Request & {
  user?: AuthUser;
};
