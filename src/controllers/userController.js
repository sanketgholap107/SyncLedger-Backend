import crypto from 'crypto';
import prisma from '../../config/prisma.js';
import { hashPassword } from '../utils/passwordHelper.js';
import { successResponse, errorResponse, validationErrorResponse } from '../utils/responseHelper.js';
// import { sendPasswordSetupEmail } from '../services/emailService.js';
import { logAction, AUDIT_ACTIONS } from '../services/auditService.js';
import { addDays } from '../utils/dateHelper.js';
import { sendPasswordSetupEmail } from '../services/emailService.js';

export const getAllUsers = async (req, res, next) => {
  try {
    const { search, role, status } = req.query;

    const where = {};

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { location: { contains: search, mode: 'insensitive' } }
      ];
    }

    if (role) {
      where.role_id = parseInt(role);
    }

    if (status) {
      where.status = status;
    }

    const users = await prisma.users.findMany({
      where,
      include: {
        roles: {
          select: {
            id: true,
            role_name: true
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    return successResponse(res, users);
  } catch (error) {
    next(error);
  }
};

export const getUserById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.users.findUnique({
      where: { id },
      include: { roles: true }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    return successResponse(res, user);
  } catch (error) {
    next(error);
  }
};

export const createUser = async (req, res, next) => {
  try {
    const { name, email, role_id, location, manager, pay_percentage } = req.body;

    if (!name || !email || !role_id) {
      return validationErrorResponse(res, ['Name, email, and role are required']);
    }

    const existingUser = await prisma.users.findUnique({
      where: { email }
    });

    if (existingUser) {
      return errorResponse(res, 'User with this email already exists', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.users.create({
        data: {
          name,
          email,
          role_id: parseInt(role_id),
          location,
          manager,
          pay_percentage: pay_percentage ? parseFloat(pay_percentage) : null,
          status: 'INVITED'
        },
        include: { roles: true }
      });

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = addDays(new Date(), 1); // 24 hours

      const passwordToken = await tx.password_setup_tokens.create({
        data: {
          user_id: user.id,
          token,
          expires_at: expiresAt
        }
      });

      return { user, passwordToken };
    });

    const emailResult = await sendPasswordSetupEmail(
      email,
      name,
      result.passwordToken.token
    );

    await logAction(req.user.userId, AUDIT_ACTIONS.USER_CREATED, {
      createdUserId: result.user.id,
      email
    });

    return successResponse(
      res,
      {
        user: result.user,
        emailSent: emailResult.success,
        setupToken: emailResult.success ? undefined : result.passwordToken.token
      },
      emailResult.success 
        ? 'User created successfully. Password setup email sent.'
        : 'User created, but email failed to send.',
      201
    );
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, email, role_id, location, manager, pay_percentage, status } = req.body;

    const existingUser = await prisma.users.findUnique({
      where: { id }
    });

    if (!existingUser) {
      return errorResponse(res, 'User not found', 404);
    }

    if (email && email !== existingUser.email) {
      const emailExists = await prisma.users.findUnique({
        where: { email }
      });

      if (emailExists) {
        return errorResponse(res, 'Email already in use', 400);
      }
    }

    const updatedUser = await prisma.users.update({
      where: { id },
      data: {
        name,
        email,
        role_id: role_id ? parseInt(role_id) : undefined,
        location,
        manager,
        pay_percentage: pay_percentage ? parseFloat(pay_percentage) : null,
        status,
        updated_at: new Date()
      },
      include: { roles: true }
    });

    await logAction(req.user.userId, AUDIT_ACTIONS.USER_UPDATED, {
      updatedUserId: id
    });

    return successResponse(res, updatedUser, 'User updated successfully');
  } catch (error) {
    next(error);
  }
};

export const deactivateUser = async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.users.findUnique({
      where: { id }
    });

    if (!user) {
      return errorResponse(res, 'User not found', 404);
    }

    const updatedUser = await prisma.users.update({
      where: { id },
      data: {
        status: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
        updated_at: new Date()
      }
    });

    await logAction(req.user.userId, AUDIT_ACTIONS.USER_UPDATED, {
      updatedUserId: id,
      action: 'status_change',
      newStatus: updatedUser.status
    });

    return successResponse(
      res,
      updatedUser,
      `User ${updatedUser.status === 'ACTIVE' ? 'activated' : 'deactivated'} successfully`
    );
  } catch (error) {
    next(error);
  }
};

export const bulkDeactivateUsers = async (req, res, next) => {
  try {
    const { userIds } = req.body;

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return validationErrorResponse(res, ['User IDs array is required']);
    }

    const result = await prisma.users.updateMany({
      where: {
        id: { in: userIds }
      },
      data: {
        status: 'DISABLED',
        updated_at: new Date()
      }
    });

    await logAction(req.user.userId, AUDIT_ACTIONS.USER_UPDATED, {
      action: 'bulk_deactivate',
      count: result.count
    });

    return successResponse(
      res,
      { count: result.count },
      `${result.count} users deactivated successfully`
    );
  } catch (error) {
    next(error);
  }
};

export const setPassword = async (req, res, next) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return validationErrorResponse(res, ['Token and password are required']);
    }

    if (password.length < 8) {
      return errorResponse(res, 'Password must be at least 8 characters long', 400);
    }

    const passwordToken = await prisma.password_setup_tokens.findUnique({
      where: { token },
      include: { users: true }
    });

    if (!passwordToken) {
      return errorResponse(res, 'Invalid or expired token', 400);
    }

    if (passwordToken.used) {
      return errorResponse(res, 'This token has already been used', 400);
    }

    if (new Date() > passwordToken.expires_at) {
      return errorResponse(res, 'Token has expired', 400);
    }

    const password_hash = await hashPassword(password);

    await prisma.$transaction(async (tx) => {
      await tx.users.update({
        where: { id: passwordToken.user_id },
        data: {
          password_hash,
          status: 'ACTIVE',
          updated_at: new Date()
        }
      });

      await tx.password_setup_tokens.update({
        where: { id: passwordToken.id },
        data: { used: true }
      });
    });

    await logAction(passwordToken.user_id, AUDIT_ACTIONS.PASSWORD_CHANGED);

    return successResponse(res, null, 'Password set successfully. You can now login.');
  } catch (error) {
    next(error);
  }
};