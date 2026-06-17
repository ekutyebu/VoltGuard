const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting database seeding...');

  // 1. Seed Default Admin User
  const adminUsername = 'admin';
  const existingAdmin = await prisma.user.findUnique({
    where: { username: adminUsername },
  });

  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('admin123', salt);
    await prisma.user.create({
      data: {
        username: adminUsername,
        passwordHash: hashedPassword,
        role: 'ADMIN',
      },
    });
    console.log('✔ Seeded default admin user: admin / admin123');
  } else {
    console.log('✔ Admin user already exists');
  }

  // 2. Define Default Devices & Thresholds
  const defaultDevices = [
    {
      id: 'DEV_VOLTGUARD_001',
      name: 'Air Compressor 1',
      location: 'Production Area A',
      threshold: {
        minVoltage: 195.0,
        maxVoltage: 253.0,
        maxCurrent: 15.0,
        maxPower: 3300.0,
        minPF: 0.80,
        maxEnergy: 10000.0,
      },
      profile: {
        avgVoltage: 225.0,
        avgCurrent: 8.5,
        avgPF: 0.88,
        freq: 50.0,
        baseEnergy: 120.5,
      }
    },
    {
      id: 'DEV_VOLTGUARD_002',
      name: 'Extraction Fan 2',
      location: 'Production Area A',
      threshold: {
        minVoltage: 195.0,
        maxVoltage: 253.0,
        maxCurrent: 10.0,
        maxPower: 2200.0,
        minPF: 0.82,
        maxEnergy: 5000.0,
      },
      profile: {
        avgVoltage: 224.0,
        avgCurrent: 3.2,
        avgPF: 0.85,
        freq: 50.0,
        baseEnergy: 45.2,
      }
    }
  ];

  for (const dev of defaultDevices) {
    // Upsert Device
    const device = await prisma.device.upsert({
      where: { id: dev.id },
      update: {
        name: dev.name,
        location: dev.location,
        status: 'ONLINE', // Seeded devices start as ONLINE or will be updated by telemetry
      },
      create: {
        id: dev.id,
        name: dev.name,
        location: dev.location,
        status: 'ONLINE',
      },
    });
    console.log(`✔ Upserted device: ${device.id} (${device.name})`);

    // Upsert Threshold
    await prisma.threshold.upsert({
      where: { deviceId: dev.id },
      update: dev.threshold,
      create: {
        deviceId: dev.id,
        ...dev.threshold,
      },
    });
    console.log(`✔ Upserted thresholds for device: ${dev.id}`);

    // Check if we already have telemetry data
    const telemetryCount = await prisma.telemetry.count({
      where: { deviceId: dev.id },
    });

    if (telemetryCount === 0) {
      console.log(`Generating 24-hour historical telemetry for ${dev.id}...`);
      const now = new Date();
      const telemetries = [];
      let currentEnergy = dev.profile.baseEnergy;

      // Create 48 data points (one every 30 mins for the last 24 hours)
      for (let i = 48; i >= 0; i--) {
        const timestamp = new Date(now.getTime() - i * 30 * 60 * 1000);
        
        // Add random fluctuation to metrics
        const voltNoise = (Math.random() - 0.5) * 8.0; // +/- 4V
        const currNoise = (Math.random() - 0.5) * 1.5; // +/- 0.75A
        const pfNoise = (Math.random() - 0.5) * 0.04;  // +/- 0.02
        
        const voltage = parseFloat((dev.profile.avgVoltage + voltNoise).toFixed(1));
        
        // Randomly simulate periods where the device is idle or off (e.g. at night)
        const hour = timestamp.getHours();
        const isWorkingHours = hour >= 8 && hour <= 18;
        const currentMultiplier = isWorkingHours ? 1.0 : (Math.random() > 0.8 ? 0.3 : 0.05);

        const current = parseFloat((Math.max(0.1, (dev.profile.avgCurrent + currNoise) * currentMultiplier)).toFixed(2));
        const pf = parseFloat((Math.min(1.0, Math.max(0.5, dev.profile.avgPF + pfNoise))).toFixed(2));
        
        // Active Power (W) = V * I * PF
        const power = parseFloat((voltage * current * pf).toFixed(1));
        
        // Increment energy: Power * hours = power * 0.5 hours / 1000 W/kW
        const energyAdded = (power * 0.5) / 1000.0;
        currentEnergy = parseFloat((currentEnergy + energyAdded).toFixed(4));
        
        const frequency = parseFloat((dev.profile.freq + (Math.random() - 0.5) * 0.2).toFixed(1));

        telemetries.push({
          deviceId: dev.id,
          voltage,
          current,
          power,
          energy: parseFloat(currentEnergy.toFixed(2)),
          frequency,
          pf,
          relayTripped: false,
          timestamp,
        });
      }

      await prisma.telemetry.createMany({
        data: telemetries,
      });
      console.log(`✔ Seeded ${telemetries.length} telemetry records for ${dev.id}`);
    } else {
      console.log(`✔ Telemetry data already exists for ${dev.id} (${telemetryCount} records)`);
    }
  }

  console.log('Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
