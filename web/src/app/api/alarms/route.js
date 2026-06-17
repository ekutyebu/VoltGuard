import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getUserFromRequest } from '@/lib/jwt';

export async function GET(request) {
  const decoded = getUserFromRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const deviceId = searchParams.get('deviceId');
  const status = searchParams.get('status');

  const filter = {};
  if (deviceId) filter.deviceId = deviceId;
  if (status) filter.status = status;

  try {
    const alarms = await prisma.alarm.findMany({
      where: filter,
      include: {
        device: {
          select: { name: true, location: true }
        }
      },
      orderBy: { timestamp: 'desc' },
      take: 100
    });

    return NextResponse.json(alarms);
  } catch (error) {
    console.error('[Alarms Fetch Error]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}

export async function POST(request) {
  const decoded = getUserFromRequest(request);
  if (!decoded) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { alarmId, action } = await request.json();

    if (!alarmId || !action) {
      return NextResponse.json(
        { error: 'alarmId and action are required' },
        { status: 400 }
      );
    }

    const alarm = await prisma.alarm.findUnique({
      where: { id: parseInt(alarmId) }
    });

    if (!alarm) {
      return NextResponse.json({ error: 'Alarm not found' }, { status: 404 });
    }

    let updatedStatus = alarm.status;
    let resolvedAt = alarm.resolvedAt;

    if (action === 'ACKNOWLEDGE') {
      updatedStatus = 'ACKNOWLEDGED';
    } else if (action === 'RESOLVE') {
      updatedStatus = 'RESOLVED';
      resolvedAt = new Date();
    } else {
      return NextResponse.json({ error: 'Invalid action. Use ACKNOWLEDGE or RESOLVE' }, { status: 400 });
    }

    const updatedAlarm = await prisma.alarm.update({
      where: { id: parseInt(alarmId) },
      data: {
        status: updatedStatus,
        resolvedAt
      },
      include: {
        device: {
          select: { name: true }
        }
      }
    });

    // If resolving, we should check if all alarms for this device are cleared. 
    // If so, we reset the device status to ONLINE.
    if (updatedStatus === 'RESOLVED') {
      const activeAlarmsCount = await prisma.alarm.count({
        where: {
          deviceId: alarm.deviceId,
          status: 'ACTIVE'
        }
      });

      if (activeAlarmsCount === 0) {
        await prisma.device.update({
          where: { id: alarm.deviceId },
          data: { status: 'ONLINE' }
        });
      }
    }

    return NextResponse.json(updatedAlarm);
  } catch (error) {
    console.error('[Alarm Action Error]', error);
    return NextResponse.json({ error: 'Database error' }, { status: 500 });
  }
}
