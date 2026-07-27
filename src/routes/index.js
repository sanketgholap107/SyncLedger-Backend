import express from 'express';
import authRoutes from './authRoutes.js';
import userRoutes from './userRoutes.js';
import roleRoutes from './roleRoutes.js';
import importRoutes from './importRoutes.js';
import seedRoutes from './seedRoutes.js';

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/roles', roleRoutes);
router.use('', importRoutes);
router.use('/seed', seedRoutes);

export default router;