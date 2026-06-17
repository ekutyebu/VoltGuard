import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

// Helper to check user auth
function checkAuth(request) {
  const decoded = getUserFromRequest(request);
  if (!decoded) return null;
  return decoded;
}

export async function GET(request, { params }) {
  const decoded = checkAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;

  try {
    const device = await prisma.device.findUnique({
      where: { id },
      include: {
        threshold: true,
        alarms: {
          orderBy: { timestamp: 'desc' },
          take: 10
        }
      }
    });

    if (!device) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Also fetch last 100 telemetry points for charting
    const telemetry = await prisma.telemetry.findMany({
      where: { deviceId: id },
      orderBy: { timestamp: 'desc' },
      take: 50
    });

    return NextResponse.json({
      device,
      telemetry: telemetry.reverse() // Return in chronological order
    });
  } catch (error) {
    console.error('[Device Get Error]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const decoded = checkAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = params;

  try {
    const { name, location, thresholds } = await request.json();

    const deviceExists = await prisma.device.findUnique({ where: { id } });
    if (!deviceExists) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    // Update Device Name & Location
    const updatedDevice = await prisma.device.update({
      where: { id },
      data: {
        name: name || deviceExists.name,
        location: location || deviceExists.location,
      }
    });

    // Update Threshold parameters if provided
    let updatedThreshold = null;
    if (thresholds) {
      updatedThreshold = await prisma.threshold.update({
        where: { deviceId: id },
        data: {
          minVoltage: parseFloat(thresholds.minVoltage),
          maxVoltage: parseFloat(thresholds.maxVoltage),
          maxCurrent: parseFloat(thresholds.maxCurrent),
          maxPower: parseFloat(thresholds.maxPower),
          minPF: parseFloat(thresholds.minPF),
          maxEnergy: parseFloat(thresholds.maxEnergy),
        }
      });
    }

    return NextResponse.json({
      device: updatedDevice,
      threshold: updatedThreshold
    });
  } catch (error) {
    console.error('[Device Update Error]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const decoded = checkAuth(request);
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (decoded.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden: Admins only' }, { status: 403 });
  }

  const { id } = params;

  try {
    await prisma.device.delete({
      where: { id }
    });

    return NextResponse.json({ success: true, message: 'Device deleted' });
  } catch (error) {
    console.error('[Device Delete Error]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
