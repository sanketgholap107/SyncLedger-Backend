import prisma from "../../config/prisma.js";
import { errorResponse, successResponse } from "../utils/responseHelper.js";
import { comparePassword } from '../utils/passwordHelper.js';
import { generateTokens } from '../services/tokenService.js';
import { logAction, AUDIT_ACTIONS } from '../services/auditService.js';


export async function login(req, res, next) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return errorResponse(res, "Email and password are required", 400);
        }

        const user = await prisma.users.findUnique({
            where: { email },
            include: { roles: true }
        })

        if (!user) {
            return errorResponse(res, "Invalid email or password", 401);
        }

        if (!user.password_hash) {
            return errorResponse(res, "Please setup your password first using the invitation link", 403);
        }
        if (user.status !== 'ACTIVE') {
            return errorResponse(res, 'Your account is not active. Please contact administrator.', 403);
        }

        const isPasswordValid = await comparePassword(password, user.password_hash);
        if (!isPasswordValid) {
            return errorResponse(res, 'Invalid email or password', 401);
        }

        const { accessToken, refreshToken } = generateTokens(user.id);

        // ✅ Set refresh token in HTTP-only cookie
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,     //can't access by javascript(XSS protection)
            sameSite: "strict", //CSRF protection
            secure: process.env.NODE_ENV === "production",  //https only in production
            maxAge: 7 * 24 * 60 * 60 * 1000 //7 days
        });

        await prisma.users.update({
            where: { id: user.id },
            data: { updated_at: new Date() }
        });

        await logAction(user.id, AUDIT_ACTIONS.LOGIN, {
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        return successResponse(res, {
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.roles.role_name,
                roleId: user.role_id,
                location: user.location,
                status: user.status
            },
            accessToken
        }, 'Login successful', 200);
    } catch (error) {
        next(error);
    }
}

export const getCurrentUser = async (req, res, next) => {
  try {
    const user = await prisma.users.findUnique({
      where: { id: req.user.userId },
      include: { roles: true },
    //   select: {
    //     id: true,
    //     name: true,
    //     email: true,
    //     roles: true,
    //     location: true,
    //     manager: true,
    //     pay_percentage: true,
    //     status: true,
    //     created_at: true
    //   }
    });

    return successResponse(res, user);
  } catch (error) {
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    // ✅ Clear the refresh token cookie
    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict"
    });

    await logAction(req.user.userId, AUDIT_ACTIONS.LOGOUT);
    return successResponse(res, null, 'Logged out successfully');
  } catch (error) {
    next(error);
  }
};

// Refresh token endpoint
export const refreshAccessToken = async (req, res, next) => {
  try {
    const refreshToken = req.cookies.refreshToken;  // ← Read from cookie

    if (!refreshToken) {
      return errorResponse(res, 'Refresh token required', 401);
    }

    // Verify refresh token
    const { verifyToken } = await import('../services/tokenService.js');
    const decoded = verifyToken(refreshToken);

    // Check if user still exists and is active
    const user = await prisma.users.findUnique({
      where: { id: decoded.userId }
    });

    if (!user || user.status !== 'ACTIVE') {
      return errorResponse(res, 'Invalid refresh token', 401);
    }

    // Generate new access token
    const { generateAccessToken } = await import('../services/tokenService.js');
    const newAccessToken = generateAccessToken(user.id);

    return successResponse(res, {
      accessToken: newAccessToken
    }, 'Token refreshed successfully');
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      // Clear expired cookie
      res.clearCookie("refreshToken", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict"
      });
      return errorResponse(res, 'Refresh token expired. Please login again.', 401);
    }
    next(error);
  }
};