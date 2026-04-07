import app from './app';
import dotenv from 'dotenv';
import prisma from './config/database';

dotenv.config();

const PORT = process.env.PORT || 5050;

// Initialize database connection
async function startServer() {
    try {
        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📝 URL: http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to connect to database:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Shutting down gracefully...');
    await prisma.$disconnect();
    process.exit(0);
});

startServer();