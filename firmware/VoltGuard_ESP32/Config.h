#ifndef CONFIG_H
#define CONFIG_H

// ==========================================
// System Modes
// ==========================================
// If enabled, PZEM-004T physical readings are simulated. Great for testing!
#define SIMULATE_PZEM 1

// ==========================================
// Device 1 Settings (Modbus Address 0x01)
// ==========================================
#define DEV1_ID "DEV_VOLTGUARD_001"
#define DEV1_NAME "Air Compressor 1"
#define DEV1_LOCATION "Production Area A"
#define DEV1_MODBUS_ADDR 0x01

// ==========================================
// Device 2 Settings (Modbus Address 0x02)
// ==========================================
#define DEV2_ID "DEV_VOLTGUARD_002"
#define DEV2_NAME "Extraction Fan 2"
#define DEV2_LOCATION "Production Area A"
#define DEV2_MODBUS_ADDR 0x02

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
    {"le_joker", "joker237546"},
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

// ==========================================
// Sensor & Sampling Timings
// ==========================================
#define SENSOR_READ_INTERVAL_MS 1000  // Read each PZEM every 1 second
#define SERVER_SEND_INTERVAL_MS 2000  // Send telemetry to server every 2 seconds
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
