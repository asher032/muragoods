import { NextResponse } from 'next/server';
import dbConnect from '@/app/lib/mongodb';
import User from '@/app/lib/models/User';

const ADMIN_EMAIL = 'mhaxthedog@gmail.com';
const ADMIN_PASSWORD = 'Jesusmaryosepcasiram';
const ADMIN_NAME = 'MuraAdmin';

// Seed a second admin too
const ADMIN2_EMAIL = 'muragoods0@gmail.com';
const ADMIN2_PASSWORD = 'Jesusmaryosepcasiram';
const ADMIN2_NAME = 'MuraAdmin2';

export async function POST() {
  try {
    await dbConnect();
    const results = [];

    // Seed first admin
    const existing1 = await User.findOne({ email: ADMIN_EMAIL });
    if (!existing1) {
      await User.create({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: 'admin',
        userId: 'MG-ADMIN-001',
        emailVerified: true,
      });
      results.push(`Created admin: ${ADMIN_EMAIL}`);
    } else {
      // Ensure role is admin
      if (existing1.role !== 'admin') {
        existing1.role = 'admin';
        await existing1.save();
        results.push(`Updated role for: ${ADMIN_EMAIL}`);
      } else {
        results.push(`Already exists: ${ADMIN_EMAIL}`);
      }
    }

    // Seed second admin
    const existing2 = await User.findOne({ email: ADMIN2_EMAIL });
    if (!existing2) {
      await User.create({
        name: ADMIN2_NAME,
        email: ADMIN2_EMAIL,
        password: ADMIN2_PASSWORD,
        role: 'admin',
        userId: 'MG-ADMIN-002',
        emailVerified: true,
      });
      results.push(`Created admin: ${ADMIN2_EMAIL}`);
    } else {
      if (existing2.role !== 'admin') {
        existing2.role = 'admin';
        await existing2.save();
        results.push(`Updated role for: ${ADMIN2_EMAIL}`);
      } else {
        results.push(`Already exists: ${ADMIN2_EMAIL}`);
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to seed admin';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

