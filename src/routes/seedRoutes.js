import express from 'express';
import { seedAdmin } from '../controllers/seedController.js';

const router = express.Router();

// POST /api/seed/admin
// One-time endpoint to seed the initial admin user.
// Disable by removing SEED_SECRET from environment variables after first use.
router.post('/admin', seedAdmin);

export default router;
