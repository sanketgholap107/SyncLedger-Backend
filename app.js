import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import prisma from './config/prisma.js';
import routes from './src/routes/index.js';
import { errorHandler, notFoundHandler } from './src/middlewares/errorHandler.js';

//getting executable
let app = express();

//middleware
app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true
}));
app.use(cookieParser());  // ← Add this BEFORE routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

//test route
app.get('/', (req, res) => {
    res.json({ message: "Sever running on prisma" })
})

//Test DB Connection
app.get('/api/test-db', async(req, res) => {
    try {
        await prisma.$queryRaw`SELECT NOW()`;
        res.json({
            success: true,
            message: 'Prisma connected to PostgreSQL successfully!',
        });
    } catch(error) {
        res.status(500).json({
            success: false,
            message: 'Database connection failed',
            error: error.message,
        });
    }
})

// API Routes
app.use('/api', routes);

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);


export default app;