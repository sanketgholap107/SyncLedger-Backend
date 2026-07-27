import express from 'express';
import { getAllRoles, getRoleById } from '../controllers/roleController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', requireRole('Admin', 'Super Admin'), getAllRoles);
router.get('/:id', requireRole('Admin', 'Super Admin'), getRoleById);

export default router;