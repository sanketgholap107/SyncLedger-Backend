import prisma from '../../config/prisma.js';
import { successResponse } from '../utils/responseHelper.js';

export const getAllRoles = async (req, res, next) => {
  try {
    const roles = await prisma.roles.findMany({
      orderBy: { id: 'asc' }
    });

    return successResponse(res, roles);
  } catch (error) {
    next(error);
  }
};

export const getRoleById = async (req, res, next) => {
  try {
    const { id } = req.params;

    const role = await prisma.roles.findUnique({
      where: { id: parseInt(id) }
    });

    if (!role) {
      return errorResponse(res, 'Role not found', 404);
    }

    return successResponse(res, role);
  } catch (error) {
    next(error);
  }
};