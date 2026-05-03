import dotenv from "dotenv";
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import prisma from './config/database.config';
import { sendError } from "./utils/response.utils";
import queryParserRouter from "./queryParser.module/queryParser.route";
import discoverRouter from "./discover.module/discover.route";
import aiChatBotRouter from "./agent.module/agent.route";
import conversationRouter from "./conversation.module/conversation.route";
import { createRateLimiter } from "./middleware/rate-limit.middleware";

dotenv.config();

// 🔥 DEBUG: confirm env is loading correctly
console.log("CORS ORIGIN:", process.env.CORS_ORIGIN);

const app = express();

const parseEnvNumber = (value: string | undefined, fallback: number): number => {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
};

const parseTrustProxy = (value: string | undefined): boolean | number | string => {
    if (!value || value === "false") {
        return false;
    }

    if (value === "true") {
        return true;
    }

    const numericValue = Number(value);

    if (Number.isInteger(numericValue) && numericValue >= 0) {
        return numericValue;
    }

    return value;
};

app.set("trust proxy", parseTrustProxy(process.env.TRUST_PROXY));

const allowedOrigins = (process.env.CORS_ORIGIN ??
    "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

// 🔥 DEBUG: confirm parsed origins
console.log("Allowed Origins:", allowedOrigins);

const apiRateLimiter = createRateLimiter({
    windowMs: parseEnvNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    maxRequests: parseEnvNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100),
});

const aiRateLimiter = createRateLimiter({
    windowMs: parseEnvNumber(process.env.AI_RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    maxRequests: parseEnvNumber(process.env.AI_RATE_LIMIT_MAX_REQUESTS, 20),
    message: "Too many AI requests, please wait before trying again.",
});

// Middleware
app.use(helmet());

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
            return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check route
app.get('/health', async (_req: Request, res: Response) => {
    try {
        await prisma.$queryRaw`SELECT 1`;

        res.status(200).json({
            success: true,
            message: 'Server is healthy',
            database: 'connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            success: false,
            message: 'Server is unhealthy',
            database: 'disconnected',
            timestamp: new Date().toISOString()
        });
    }
});

app.get('/live', (_req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: 'Server is alive',
        timestamp: new Date().toISOString()
    });
});

app.get('/', (_req: Request, res: Response) => {
    res.status(200).json({
        success: true,
        message: 'OK',
        timestamp: new Date().toISOString()
    });
});

// API Routes
app.use("/api/v1", apiRateLimiter);
app.use("/api/v1/query-parser", queryParserRouter);
app.use("/api/v1/discover", aiRateLimiter, discoverRouter);
app.use("/api/v1/ai-chatbot", aiRateLimiter, aiChatBotRouter);
app.use("/api/v1/conversation", aiRateLimiter, conversationRouter);

// 404 handler
app.use((_req: Request, res: Response) => {
    return sendError(res, "Route not found", "ROUTE_NOT_FOUND", 404);
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    return sendError(
        res,
        err.message || "Internal server error",
        "INTERNAL_SERVER_ERROR",
        500
    );
});

export default app;
