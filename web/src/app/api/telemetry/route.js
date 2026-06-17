import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { sendTelegramAlert } from '@/lib/telegram';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      deviceId,
      deviceName,
      location,
      voltage,
      current,
      power,
      energy,
      frequency,
      pf,
      fault,
      relayTripped,
      timestamp,
      wifiSSID,
      wifiRSSI,
    } = body;

    if (!deviceId) {
      return NextResponse.json({ error: 'deviceId is required' }, { status: 400 });
    }

    // 1. Convert timestamp to Date object
    const telemetryDate = timestamp ? new Date(timestamp * 1000) : new Date();

    // 1.5 Ensure Device exists in DB so Threshold upsert doesn't fail on foreign key
    const initialStatus = relayTripped ? 'FAULT' : 'ONLINE';
    await prisma.device.upsert({
      where: { id: deviceId },
      update: {
        name: deviceName || undefined,
        location: location || undefined,
        status: initialStatus,
        wifiSSID: wifiSSID || undefined,
        wifiRSSI: wifiRSSI !== undefined ? wifiRSSI : undefined,
      },
      create: {
        id: deviceId,
        name: deviceName || 'Unknown Device',
        location: location || 'Unknown Location',
        status: initialStatus,
        wifiSSID: wifiSSID || null,
        wifiRSSI: wifiRSSI || null,
      },
    });

    // 2. Establish baseline thresholds (upsert default first if not present)
    const threshold = await prisma.threshold.upsert({
      where: { deviceId },
      update: {},
      create: {
        deviceId,
        minVoltage: 195.0,
        maxVoltage: 253.0,
        maxCurrent: 15.0,
        maxPower: 3300.0,
        minPF: 0.80,
        maxEnergy: 10000.0,
      },
    });

    // 3. Evaluate active faults based on DB thresholds
    const faultChecks = [
      {
        type: 'UNDERVOLTAGE',
        isViolated: voltage < threshold.minVoltage,
        value: voltage,
        limit: threshold.minVoltage,
        unit: 'V',
      },
      {
        type: 'OVERVOLTAGE',
        isViolated: voltage > threshold.maxVoltage,
        value: voltage,
        limit: threshold.maxVoltage,
        unit: 'V',
      },
      {
        type: 'OVERCURRENT',
        isViolated: current > threshold.maxCurrent,
        value: current,
        limit: threshold.maxCurrent,
        unit: 'A',
      },
      {
        type: 'OVERLOAD',
        isViolated: power > threshold.maxPower,
        value: power,
        limit: threshold.maxPower,
        unit: 'W',
      },
      {
        type: 'LOW_POWER_FACTOR',
        isViolated: pf < threshold.minPF && power > 100.0, // Only when under actual load
        value: pf,
        limit: threshold.minPF,
        unit: '',
      },
      {
        type: 'SHORT_CIRCUIT',
        isViolated: fault === 'SHORT_CIRCUIT' || current > (threshold.maxCurrent * 1.5),
        value: current,
        limit: threshold.maxCurrent * 1.5,
        unit: 'A',
      },
    ];

    let hasActiveFault = false;

    // Process each fault check
    for (const check of faultChecks) {
      // Find if there is an existing ACTIVE alarm of this type
      const activeAlarm = await prisma.alarm.findFirst({
        where: {
          deviceId,
          type: check.type,
          status: 'ACTIVE',
        },
      });

      if (check.isViolated) {
        hasActiveFault = true;

        if (!activeAlarm) {
          // Trigger new Alarm
          const newAlarm = await prisma.alarm.create({
            data: {
              deviceId,
              type: check.type,
              value: check.value,
              threshold: check.limit,
              status: 'ACTIVE',
              timestamp: telemetryDate,
            },
          });

          // Dispatch Telegram Alert
          await sendTelegramAlert({
            deviceId,
            deviceName,
            location,
            faultCategory: check.type,
            measuredValue: check.value,
            thresholdValue: check.limit,
            unit: check.unit,
            timestamp: telemetryDate,
            isResolution: false,
            relayTripped,
          });
        }
      } else {
        // Condition normal. Resolve existing alarm if active
        if (activeAlarm) {
          await prisma.alarm.update({
            where: { id: activeAlarm.id },
            data: {
              status: 'RESOLVED',
              resolvedAt: telemetryDate,
            },
          });

          // Dispatch Telegram Resolution notification
          await sendTelegramAlert({
            deviceId,
            deviceName,
            location,
            faultCategory: check.type,
            measuredValue: check.value,
            thresholdValue: check.limit,
            unit: check.unit,
            timestamp: telemetryDate,
            isResolution: true,
            relayTripped,
          });
        }
      }
    }

    // 4. Update Device status and metadata
    const deviceStatus = (hasActiveFault || relayTripped) ? 'FAULT' : 'ONLINE';
    await prisma.device.update({
      where: { id: deviceId },
      data: {
        name: deviceName || undefined,
        location: location || undefined,
        status: deviceStatus,
        updatedAt: new Date(),
      },
    });

    // 5. Store the Raw Telemetry record
    const telemetry = await prisma.telemetry.create({
      data: {
        deviceId,
        voltage,
        current,
        power,
        energy,
        frequency,
        pf,
        relayTripped,
        timestamp: telemetryDate,
      },
    });

    return NextResponse.json({
      success: true,
      deviceId,
      status: deviceStatus,
      telemetryId: telemetry.id,
    }, { status: 201 });
  } catch (error) {
    console.error('[Telemetry Ingestion Error]', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
