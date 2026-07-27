import express from 'express';
import { login, getCurrentUser, logout, refreshAccessToken } from '../controllers/authController.js';
import { setPassword } from '../controllers/userController.js';
import { authenticateToken } from '../middlewares/auth.js';

const router = express.Router();

router.post('/login', login);
router.post('/logout', authenticateToken, logout);
router.get('/me', authenticateToken, getCurrentUser);
router.post('/set-password', setPassword);
router.post('/refresh', refreshAccessToken);


export default router;