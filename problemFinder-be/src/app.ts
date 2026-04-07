import express, { Request, Response, NextFunction } from 'express';
// import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import prisma from './config/database';

const app = express();

// Middleware
app.use(helmet()); // Security headers
// app.use(cors({
//     origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
//     credentials: true
// }));
app.use(morgan('dev')); // Logging
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Health check route
app.get('/health', async (_req: Request, res: Response) => {
    try {
        // Check database connection
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

// API Routes
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v1/nurses', nurseRoutes);
// app.use('/api/v1/patients', patientRoutes);
// app.use('/api/v1/shifts', shiftRoutes);

// 404 handler
app.use((_req: Request, res: Response) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Error:', err);
    res.status(500).json({
        success: false,
        message: err.message || 'Internal server error'
    });
});

export default app;
