import { NextFunction, Request, Response } from "express";
import { AnyZodObject, ZodTypeAny } from "zod";

export function validateBody(schema: AnyZodObject | ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction): Response | void => {
    const parsed = schema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        error: "VALIDATION_ERROR",
        details: parsed.error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    req.body = parsed.data;
    next();
  };
}
