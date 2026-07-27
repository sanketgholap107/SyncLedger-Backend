import bcrypt from 'bcrypt';
import prisma from '../config/prisma.js';
import dotenv from 'dotenv';

dotenv.config();

const createAdmin = async () => {
  try {
    const email = process.env.ADMIN_EMAIL || 'admin@syncledger.com';
    const password = process.env.ADMIN_PASSWORD;
    const name = process.env.ADMIN_NAME || 'Super Admin';

    if (!password) {
      console.error('❌ ADMIN_PASSWORD environment variable is required. Aborting.');
      process.exit(1);
    }

    const existing = await prisma.users.findUnique({ where: { email } });
    if (existing) {
      console.log('❌ Admin user already exists');
      return;
    }

    const adminRole = await prisma.roles.findFirst({
      where: { role_name: 'Admin' }
    });

    if (!adminRole) {
      console.log('❌ Admin role not found. Creating roles...');
      
      // Create roles
      await prisma.roles.createMany({
        data: [
          { role_name: 'Admin', description: 'Full system access' },
          { role_name: 'Employee', description: 'Limited access' },
          { role_name: 'DSA Partner', description: 'Partner access' }
        ]
      });

      const newAdminRole = await prisma.roles.findFirst({
        where: { role_name: 'Admin' }
      });

      const password_hash = await bcrypt.hash(password, 10);

      await prisma.users.create({
        data: {
          name,
          email,
          password_hash,
          role_id: newAdminRole.id,
          status: 'ACTIVE'
        }
      });
    } else {
      const password_hash = await bcrypt.hash(password, 10);

      await prisma.users.create({
        data: {
          name,
          email,
          password_hash,
          role_id: adminRole.id,
          status: 'ACTIVE'
        }
      });
    }

    console.log('✅ Admin user created successfully!');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log('⚠️  Please change the password after first login!');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
};

createAdmin();