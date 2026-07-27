import bcrypt from 'bcrypt';
import prisma from '../config/prisma.js';
import dotenv from 'dotenv';

dotenv.config();

const createTestUsers = async () => {
    try {
        // Get roles
        const adminRole = await prisma.roles.findFirst({ where: { role_name: 'Admin' } });
        const dsaRole = await prisma.roles.findFirst({ where: { role_name: 'DSA Partner' } });

        if (!adminRole || !dsaRole) {
            console.log('❌ Roles not found. Run createAdmin.js first.');
            return;
        }

        // ─── Create Admin User ──────────────────────────────────────────────
        const adminEmail = 'admin@sastapaisa.com';
        const existingAdmin = await prisma.users.findUnique({ where: { email: adminEmail } });

        if (existingAdmin) {
            console.log(`⚠️  Admin user ${adminEmail} already exists, skipping.`);
        } else {
            const adminHash = await bcrypt.hash('Admin@123', 10);
            await prisma.users.create({
                data: {
                    name: 'Admin User',
                    email: adminEmail,
                    password_hash: adminHash,
                    role_id: adminRole.id,
                    status: 'ACTIVE',
                    location: 'Head Office',
                }
            });
            console.log('✅ Admin user created:');
            console.log(`   Email: ${adminEmail}`);
            console.log(`   Password: Admin@123`);
        }

        // ─── Create DSA Partner User ────────────────────────────────────────
        const dsaEmail = 'dsa@sastapaisa.com';
        const existingDsa = await prisma.users.findUnique({ where: { email: dsaEmail } });

        if (existingDsa) {
            console.log(`⚠️  DSA Partner user ${dsaEmail} already exists, skipping.`);
        } else {
            const dsaHash = await bcrypt.hash('Dsa@123', 10);
            await prisma.users.create({
                data: {
                    name: 'DSA Partner',
                    email: dsaEmail,
                    password_hash: dsaHash,
                    role_id: dsaRole.id,
                    status: 'ACTIVE',
                    location: 'Mumbai',
                }
            });
            console.log('✅ DSA Partner user created:');
            console.log(`   Email: ${dsaEmail}`);
            console.log(`   Password: Dsa@123`);
        }

        console.log('\n🎉 Done! Test accounts:');
        console.log('┌─────────────────────────────────────────────────┐');
        console.log('│ Super Admin   │ admin@syncledger.com │ Admin@123 │');
        console.log('│ Admin         │ admin@sastapaisa.com │ Admin@123 │');
        console.log('│ DSA Partner   │ dsa@sastapaisa.com   │ Dsa@123   │');
        console.log('└─────────────────────────────────────────────────┘');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await prisma.$disconnect();
    }
};

createTestUsers();
