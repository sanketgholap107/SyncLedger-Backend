import express from 'express';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  deactivateUser,
  bulkDeactivateUsers
} from '../controllers/userController.js';
import { authenticateToken, requireRole } from '../middlewares/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', requireRole('Admin', 'Super Admin'), getAllUsers);
router.get('/agents', requireRole('Admin', 'Super Admin'), getAllUsers);
router.post('/', requireRole('Admin', 'Super Admin'), createUser);
router.get('/:id', requireRole('Admin', 'Super Admin'), getUserById);
router.put('/:id', requireRole('Admin', 'Super Admin'), updateUser);
router.delete('/:id', requireRole('Admin', 'Super Admin'), deleteUser);
router.patch('/:id/deactivate', requireRole('Admin', 'Super Admin'), deactivateUser);
router.post('/bulk-deactivate', requireRole('Admin', 'Super Admin'), bulkDeactivateUsers);

export default router;