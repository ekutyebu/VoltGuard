#ifndef CONFIG_H
#define CONFIG_H

// ==========================================
// System Modes
// ==========================================
// If enabled, PZEM-004T physical readings are simulated. Great for testing!
#define SIMULATE_PZEM 1

// ==========================================
// Dynamic Modbus Auto-Discovery Settings
// ==========================================
#define MAX_NODES 10              // Max number of active PZEM sensors to support
#define MODBUS_SCAN_START 1       // Address to start scanning (0x01)
#define MODBUS_SCAN_END 10        // Address to end scanning (0x0A)

// ==========================================
// Network Settings
// ==========================================
#define WIFI_SSID "DarkDev"
#define WIFI_PASSWORD "Man2001@"

// Structure for multiple Wi-Fi networks configuration
struct WiFiCredential {
    const char* ssid;
    const char* password;
};

// Define multiple Wi-Fi credentials. The firmware will scan and connect to the strongest available AP.
// Feel free to add as many APs as you need here!
static const WiFiCredential WIFI_NETWORKS[] = {
    {"DarkDev", "Man2001@"},
    {"Javis", "1234567890"},
    {"Le_joker", "joker237546"},
    {"Monsieur_river", "River692192802"}
};
static const int WIFI_NETWORK_COUNT = sizeof(WIFI_NETWORKS) / sizeof(WIFI_NETWORKS[0]);

// Next.js Server API Telemetry Ingestion Endpoint
// Live Vercel Deployment (Production Cloud)
#define BACKEND_API_URL "https://voltguard-beta.vercel.app/api/telemetry"

// Network timeouts
#define HTTP_TIMEOUT_MS 5000
#define WIFI_RECONNECT_INTERVAL_MS 10000

// ==========================================
// Hardware Pin Mappings (ESP32 DevKit V1)
// ==========================================
#define PZEM_RX_PIN 16  // HardwareSerial 2 RX (Connect to both PZEM TX pins in parallel)
#define PZEM_TX_PIN 17  // HardwareSerial 2 TX (Connect to both PZEM RX pins in parallel)

#define RELAY_1_PIN 23  // Trip Relay for Device 1
#define RELAY_2_PIN 22  // Trip Relay for Device 2
#define LED_ALARM_PIN 2 // Built-in LED or external alarm LED indicator
#define LED_WIFI_PIN 4  // Wi-Fi status LED indicator

// I2C LCD Monitor Pin Mappings (safe custom pins)
#define LCD_SDA_PIN 21  // SDA connected to ESP32 Pin 21
#define LCD_SCL_PIN 19  // SCL connected to ESP32 Pin 19 (prevents conflict with Relay 2 on pin 22)
#define LCD_I2C_ADDR 0x27 // Default I2C Address for most 1602/2004 LCD modules
#define LCD_COLS 16       // 16 columns
#define LCD_ROWS 2        // 2 rows

// ==========================================
// Sensor & Sampling Timings
// ==========================================
#define SENSOR_READ_INTERVAL_MS 1000  // Read each PZEM every 1 second
#define SERVER_SEND_INTERVAL_MS 10000 // Send telemetry to server every 10 seconds to avoid HTTP upload bottlenecks
#define RING_BUFFER_SIZE 100           // Queue up to 100 readings if Wi-Fi goes down

// ==========================================
// Local Protection Thresholds (Fallback)
// ==========================================
#define THRESHOLD_MIN_VOLTAGE 195.0f   // Volts
#define THRESHOLD_MAX_VOLTAGE 253.0f   // Volts
#define THRESHOLD_MAX_CURRENT 15.0f    // Amperes
#define THRESHOLD_MAX_POWER   3300.0f  // Watts (Active Power)
#define THRESHOLD_MIN_PF      0.80f    // Power Factor

// Automatic reconnection & recovery
#define RELAY_AUTORECOVERY_MS 10000    // Wait 10 seconds after a trip to attempt auto-reset

#endif // CONFIG_H
