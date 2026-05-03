import { NextFunction, Request, Response } from "express";
import { sendError } from "../utils/response.utils";

interface RateLimitOptions {
    windowMs: number;
    maxRequests: number;
    message?: string;
    keyGenerator?: (req: Request) => string;
}

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

const DEFAULT_MESSAGE = "Too many requests, please try again later.";

const getClientKey = (req: Request): string => {
    const forwardedFor = req.headers["x-forwarded-for"];

    if (typeof forwardedFor === "string" && forwardedFor.length > 0) {
        return forwardedFor.split(",")[0].trim();
    }

    return req.ip || "unknown";
};

export const createRateLimiter = ({
    windowMs,
    maxRequests,
    message = DEFAULT_MESSAGE,
    keyGenerator = getClientKey,
}: RateLimitOptions) => {
    const requests = new Map<string, RateLimitEntry>();
    let cleanupCounter = 0;

    const cleanupExpiredEntries = (now: number) => {
        cleanupCounter += 1;

        if (cleanupCounter % 100 !== 0) {
            return;
        }

        for (const [key, entry] of requests.entries()) {
            if (entry.resetTime <= now) {
                requests.delete(key);
            }
        }
    };

    return (req: Request, res: Response, next: NextFunction) => {
        const now = Date.now();
        const key = keyGenerator(req);
        const currentEntry = requests.get(key);

        cleanupExpiredEntries(now);

        if (!currentEntry || currentEntry.resetTime <= now) {
            const resetTime = now + windowMs;

            requests.set(key, {
                count: 1,
                resetTime,
            });

            res.setHeader("X-RateLimit-Limit", maxRequests.toString());
            res.setHeader("X-RateLimit-Remaining", (maxRequests - 1).toString());
            res.setHeader("X-RateLimit-Reset", new Date(resetTime).toISOString());

            next();
            return;
        }

        currentEntry.count += 1;

        const remainingRequests = Math.max(maxRequests - currentEntry.count, 0);

        res.setHeader("X-RateLimit-Limit", maxRequests.toString());
        res.setHeader("X-RateLimit-Remaining", remainingRequests.toString());
        res.setHeader(
            "X-RateLimit-Reset",
            new Date(currentEntry.resetTime).toISOString()
        );

        if (currentEntry.count > maxRequests) {
            const retryAfterSeconds = Math.ceil((currentEntry.resetTime - now) / 1000);

            res.setHeader("Retry-After", retryAfterSeconds.toString());

            sendError(
                res,
                message,
                "RATE_LIMIT_EXCEEDED",
                429,
                {
                    retryAfterSeconds,
                    limit: maxRequests,
                    windowMs,
                }
            );
            return;
        }

        next();
    };
};
