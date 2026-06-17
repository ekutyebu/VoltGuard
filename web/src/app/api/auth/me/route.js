import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/jwt';
import prisma from '@/lib/prisma';

export async function GET(request) {
  const decoded = getUserFromRequest(request);

  if (!decoded) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        role: true,
      },
    });

    if (!user) {
      return NextResponse.json({ authenticated: false }, { status: 401 });
    }

    return NextResponse.json({ authenticated: true, user });
  } catch (error) {
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
