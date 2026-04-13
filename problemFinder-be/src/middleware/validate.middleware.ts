import { ZodObject, ZodError } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response.utils';

export const validate = (schema: ZodObject<any>) => (
    req: Request,
    res: Response,
    next: NextFunction
): Response | void => {
    try {
        schema.parse({
            body: req.body,
            params: req.params,
            query: req.query,
        });
        next();
    } catch (err: any) {
        if (err instanceof ZodError && err.issues.length > 0) {
            console.error("Validation error:", err);
            const firstErrorMessage = err.issues[0].message;
            return sendError(res, firstErrorMessage, "VALIDATION_ERROR", 400);
        }

        return sendError(res, "Invalid request", "VALIDATION_ERROR", 400);
    }
};
