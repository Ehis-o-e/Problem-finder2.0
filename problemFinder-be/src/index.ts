import app from './app';
import dotenv from 'dotenv';
import prisma from './config/database.config';
import { initEmbeddings } from './embedding.module/embedding.service';

dotenv.config();

const PORT = process.env.PORT || 5050;

async function startServer() {
    try {
        // Test database connection
        await prisma.$connect();
        console.log('✅ Database connected successfully');

        // Load embedding model and cache anchor vectors
        await initEmbeddings();
        console.log('✅ Embeddings initialised');

        // Start server
        app.listen(PORT, () => {
            console.log(`🚀 Server running on port ${PORT}`);
            console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`📝 URL: http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

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