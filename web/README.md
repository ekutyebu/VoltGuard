# VoltGuard - Industrial Smart Electrical Fault Monitoring System

VoltGuard is a scalable, mechatronic IoT monitoring system designed to track real-time electrical metrics (voltage, current, active power, frequency, power factor, and cumulative energy) and protect physical assets from anomalies like overvoltage, undervoltage, overload, and short circuits.

The system uses an **ESP32 DevKit V1** paired with a **PZEM-004T V3.0** energy monitoring module at the edge, communicating with a **Next.js** control panel and **PostgreSQL** database deployed on Vercel.

---

## System Architecture

```mermaid
graph TD
    subgraph Edge Layer (ESP32 DevKit V1)
        A[PZEM-004T V3.0 Sensor] -->|UART Serial| B(Core 1: Sensor & Fault Check)
        B -->|Relay Tripped GPIO| C[Automatic Trip Relay]
        B -->|FreeRTOS Queue| D(Core 0: Network Queue & Buffer)
        D -->|WiFi Offline| E[Circular RAM Ring Buffer]
    end

    subgraph Cloud Layer (Next.js on Vercel)
        D -->|HTTP POST JSON| F[Telemetry Ingest API]
        F -->|Upsert Device & Log| G[(PostgreSQL DB via Prisma)]
        F -->|Threshold Violation| H[Telegram Alarm Webhook]
    end

    subgraph Notification & Control Layer
        H -->|Alert Notification| I[Telegram Group Chat]
        J[Browser Dashboards / HMIs] -->|Verify Auth| F
        J -->|JSON Web Token Sessions| G
    end
```

---

## ⚡ ESP32 Hardware & Wiring

### 1. Pin Configuration (ESP32 DevKit V1)

Default mapping configured in `Config.h`:
*   **PZEM-004T RX** ➔ **ESP32 GPIO 17** (TX2)
*   **PZEM-004T TX** ➔ **ESP32 GPIO 16** (RX2)
*   **Trip Relay Control** ➔ **ESP32 GPIO 23** (Active-High/Low Contactor Drive)
*   **Warning LED** ➔ **ESP32 GPIO 2** (Built-in Blue LED)
*   **Wi-Fi Status LED** ➔ **ESP32 GPIO 4**

### 2. Physical PZEM-004T V3.0 Schematic

> [!WARNING]
> **HIGH VOLTAGE WARNING**
> Operating with 110V/220V AC is dangerous. Ensure the AC grid power supply is disconnected before wiring the PZEM screw terminals. Always use appropriate enclosures and opto-isolation.

```
       [ AC Grid Power (110V-220V) ]
         |                       |
         |=== (CT Current coil) =|
         |                       |
      [L Terminal]          [N Terminal]
         |                       |
   +------------------------------------+
   |       PZEM-004T V3.0 Module        |
   |                                    |
   |   5V     RX     TX    GND   (TTL)  |
   +---|------|------|------|-----------+
       |      |      |      |
      5V    GPIO17 GPIO16  GND
       |      |      |      |
   +---|------|------|------|-----------+
   |   5V    TX2    RX2    GND          |
   |                                    |
   |         ESP32 DevKit V1            |
   |                                    |
   |   GPIO23 (Relay Drive output)       |
   +-----|------------------------------+
         |
     [ Relay / Contactor coil Input ]
```

---

## 💻 Web App & Database Setup

The web application is built with Next.js (App Router) and uses Prisma to map the schema onto PostgreSQL.

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org/) (v18.x or later)
*   Access to a PostgreSQL instance (Supabase, Neon, or local PostgreSQL database)

### 2. Environment Variables
Create a file named `.env` in the `web/` directory (you can copy the configured default `.env` created in this repo) and adjust details:

```env
DATABASE_URL="postgresql://username:password@host:port/database?schema=public"
JWT_SECRET="generate-some-random-secret-key"
TELEGRAM_BOT_TOKEN="8710474348:AAF5RdKYQ2snPrDfiQ2oRwp0WWYNOtyjQLA"
TELEGRAM_CHAT_ID="YOUR_CHAT_ID"
```

### 3. Install & Sync DB
Run the following terminal commands inside the `web/` directory:

```bash
# Install NPM dependencies
npm install

# Generate the Prisma Client
npm run prisma:generate

# Push schemas to PostgreSQL
npm run prisma:db:push
```

### 4. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) on your HMI or browser to log in.

*   **Default Operator Login:** `admin`
*   **Access Password:** `admin123`
*(The user table automatically seeds this account on the first login attempt if the database is blank).*

---

## 🤖 PZEM-004T Simulation Mode
If you do not have physical hardware, you can still compile and deploy the ESP32 code to verify the system end-to-end.

In `Config.h`, verify that the simulator toggle is active:
```cpp
#define SIMULATE_PZEM 1
```

In this mode, the firmware generates a realistic industrial load duty cycle:
*   **Idle Cycle (0-40s)**: Lower current, low power factor (~0.6).
*   **Active Compressor Load (40-90s)**: Heavy inductive load drawing ~8.5A.
*   **Overvoltage test fault (90-100s)**: Grid voltage surges to 258V. Triggers OVERVOLTAGE alarms.
*   **Overload current spike (100-110s)**: Heavy load spike drawing 17.5A. Opens the Protection Relay.
*   **Low Power Factor fault (110-120s)**: Power factor drops to 0.55.

---

& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" run -t upload
& "$env:USERPROFILE\.platformio\penv\Scripts\pio.exe" device monitor

## 🚀 Deployment on Vercel
1.  Push this repository to GitHub.
2.  Import the project into Vercel.
3.  Add the Environment Variables (`DATABASE_URL`, `JWT_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) inside the Vercel Dashboard project settings.
4.  Vercel automatically runs `npm run build` and spins up the serverless backend.
