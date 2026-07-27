import prisma from '../../config/prisma.js';

export const logAction = async (userId, action, details = {}) => {
  try {
    // For now, just console log
    // Later you can save to audit_logs table
    console.log(`[AUDIT] User: ${userId}, Action: ${action}`, details);
    
    // TODO: Implement database logging when audit_logs table is created
    // await prisma.auditLog.create({
    //   data: {
    //     user_id: userId,
    //     action,
    //     details: JSON.stringify(details),
    //     ip_address: details.ip,
    //     user_agent: details.userAgent,
    //     created_at: new Date()
    //   }
    // });
  } catch (error) {
    console.error('Audit logging failed:', error);
  }
};

export const AUDIT_ACTIONS = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  PASSWORD_CHANGED: 'password_changed',
  PASSWORD_RESET: 'password_reset'
};