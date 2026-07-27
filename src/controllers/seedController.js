import bcrypt from 'bcrypt';
import prisma from '../../config/prisma.js';

/**
 * POST /api/seed/admin
 * 
 * One-time endpoint to create the initial admin user and roles.
 * Protected by SEED_SECRET environment variable.
 * 
 * To disable permanently: remove SEED_SECRET from your environment variables.
 * 
 * Request body:
 * {
 *   "secret": "<value of SEED_SECRET env var>",
 *   "email": "admin@example.com",       (optional, defaults to ADMIN_EMAIL env var)
 *   "password": "StrongPassword123!",   (required)
 *   "name": "Super Admin"               (optional)
 * }
 */
export const seedAdmin = async (req, res) => {
  try {
    // 1. Check if seeding is enabled at all
    const seedSecret = process.env.SEED_SECRET;
    if (!seedSecret) {
      return res.status(403).json({
        success: false,
        message: 'Seeding is disabled. Set SEED_SECRET environment variable to enable it.',
      });
    }

    // 2. Validate the secret key from request body
    const { secret, email, password, name } = req.body;

    if (!secret || secret !== seedSecret) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or missing seed secret.',
      });
    }

    // 3. Validate required fields
    if (!password || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Password is required and must be at least 8 characters.',
      });
    }

    const adminEmail = email || process.env.ADMIN_EMAIL || 'admin@syncledger.com';
    const adminName = name || 'Super Admin';

    // 4. Check if admin already exists
    const existingUser = await prisma.users.findUnique({
      where: { email: adminEmail },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: `User with email ${adminEmail} already exists. Seeding skipped.`,
      });
    }

    // 5. Create roles if they don't exist
    const rolesToCreate = [
      { role_name: 'Super Admin', description: 'Full system access' },
      { role_name: 'Admin', description: 'Admin access' },
      { role_name: 'DSA Partner', description: 'Partner access' },
    ];

    for (const role of rolesToCreate) {
      await prisma.roles.upsert({
        where: { role_name: role.role_name },
        update: {},
        create: role,
      });
    }

    // 6. Get the Super Admin role
    const superAdminRole = await prisma.roles.findFirst({
      where: { role_name: 'Super Admin' },
    });

    if (!superAdminRole) {
      return res.status(500).json({
        success: false,
        message: 'Failed to create or find Super Admin role.',
      });
    }

    // 7. Hash password and create the admin user
    const password_hash = await bcrypt.hash(password, 10);

    const adminUser = await prisma.users.create({
      data: {
        name: adminName,
        email: adminEmail,
        password_hash,
        role_id: superAdminRole.id,
        status: 'ACTIVE',
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        created_at: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: '✅ Admin user and roles created successfully!',
      user: adminUser,
      reminder: '⚠️ Remove SEED_SECRET from your environment variables now to disable this endpoint permanently.',
    });

  } catch (error) {
    console.error('[Seed Error]', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error during seeding.',
      error: error.message,
    });
  }
};
