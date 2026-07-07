import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function GET(request) {
  // Allow authenticated users to view devices
  const decoded = getUserFromRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const devices = await prisma.device.findMany({
      include: {
        threshold: true,
        _count: {
          select: {
            alarms: {
              where: { status: 'ACTIVE' }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json(devices);
  } catch (error) {
    console.error('[Devices Fetch Error]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(request) {
  // Authenticate user
  const decoded = getUserFromRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only Admin can add devices manually
  if (decoded.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  try {
    const { id, name, location, thresholds } = await request.json();

    if (!id || !name || !location) {
      return NextResponse.json(
        { error: 'id, name, and location are required' },
        { status: 400 }
      );
    }

    // Create device and associate default thresholds
    const device = await prisma.device.create({
      data: {
        id,
        name,
        location,
        status: 'OFFLINE',
        threshold: {
          create: {
            minVoltage: thresholds?.minVoltage || 180.0,
            maxVoltage: thresholds?.maxVoltage || 255.0,
            maxCurrent: thresholds?.maxCurrent || 15.0,
            maxPower: thresholds?.maxPower || 3300.0,
            minPF: thresholds?.minPF || 0.80,
            maxEnergy: thresholds?.maxEnergy || 10000.0,
          }
        }
      },
      include: {
        threshold: true
      }
    });

    return NextResponse.json(device, { status: 201 });
  } catch (error) {
    console.error('[Device Create Error]', error);
    if (error.code === 'P2002') {
      return NextResponse.json(
        { error: 'Device with this ID already exists' },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
