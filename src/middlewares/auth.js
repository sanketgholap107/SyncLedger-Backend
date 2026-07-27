import { verifyToken } from "../services/tokenService.js";
import prisma from "../../config/prisma.js";
import { errorResponse } from "../utils/responseHelper.js";

//authenticate token
export async function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers['authorization'];
        // Support token via query param for download links (window.open)
        const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

        if (!token) {
            return errorResponse(res, 'Access token Required', 401);
        }

        const decoded = verifyToken(token);

        const user = await prisma.users.findUnique({
            where: { id: decoded.userId },
            include: { roles: true }
        })

        if (!user) {
            return errorResponse(res, 'User not found', 401);
        }

        if (user.status !== 'ACTIVE') {
            return errorResponse(res, 'User account is not active', 403)
        }

        req.user = {
            userId: user.id,
            email: user.email,
            role: user.roles.role_name,
            roleId: user.role_id,
        };

        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return errorResponse(res, 'Token expired', 401);
        }
        return errorResponse(res, 'Invalid token', 403);
    }
}

//require role
export function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return errorResponse(res, 'Authentication required', 401);
        }

        if (!allowedRoles.includes(req.user.role)) {
            return errorResponse(res, 'Insufficient permissions', 403);
        }

        next();
    };
}