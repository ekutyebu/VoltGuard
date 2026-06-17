#include <Arduino.h>
#include <ArduinoOTA.h>
#include "Config.h"
#include "PZEM_Manager.h"
#include "FaultDetector.h"
#include "NetworkManager.h"

// Struct to communicate readings and protection states between tasks
struct TelemetryPayload {
    char deviceId[32];
    char deviceName[32];
    char location[32];
    ElectricalMetrics metrics;
    FaultType fault;
    bool relayTripped;
};

// FreeRTOS Queue Handles
QueueHandle_t telemetryQueue = nullptr;

// Device Components
PZEM_Manager pzem(PZEM_RX_PIN, PZEM_TX_PIN);

// Independent protection loops for both mechatronic nodes
FaultDetector faultDetector1(RELAY_1_PIN, LED_ALARM_PIN);
FaultDetector faultDetector2(RELAY_2_PIN, LED_ALARM_PIN);

NetworkManager network(WIFI_SSID, WIFI_PASSWORD, BACKEND_API_URL);

// Task Declarations
void Task_ReadSensors(void* pvParameters);
void Task_Network(void* pvParameters);

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("==================================================");
    Serial.println("   VoltGuard Industrial Fault Monitor (Multi-Node)");
    Serial.println("==================================================");

    // Initialize local protection outputs and sensor drivers
    faultDetector1.begin();
    faultDetector2.begin();
    pzem.begin();

    // Create a FreeRTOS queue to hold telemetry readings for transmission
    // Queue handles up to 20 payloads (enough for high frequency uploads)
    telemetryQueue = xQueueCreate(20, sizeof(TelemetryPayload));
    if (telemetryQueue == nullptr) {
        Serial.println("[System] Critical Error: Failed to create FreeRTOS Queue.");
        while (1) { delay(1000); }
    }

    // Launch Core 1 Tasks - Real-time Sensor Monitoring (Highest priority)
    xTaskCreatePinnedToCore(
        Task_ReadSensors,       // Task function
        "Task_ReadSensors",     // Task name
        4096,                   // Stack size (bytes)
        NULL,                   // Parameter
        2,                      // Priority (higher)
        NULL,                   // Task handle
        1                       // Core ID (Core 1)
    );

    // Launch Core 0 Tasks - Network & IoT Management
    xTaskCreatePinnedToCore(
        Task_Network,
        "Task_Network",
        8192,                   // Stack size
        NULL,
        1,                      // Priority (lower)
        NULL,
        0                       // Core ID (Core 0)
    );

    Serial.println("[System] FreeRTOS Multitasking Environment started.");
}

void loop() {
    // All processing is offloaded to FreeRTOS tasks.
    vTaskDelete(NULL); 
}

// ==========================================================
// TASK: Read Sensors (Core 1)
// Handles sequential PZEM polling, local limits checking, 
// and queuing telemetry.
// ==========================================================
void Task_ReadSensors(void* pvParameters) {
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xFrequency = pdMS_TO_TICKS(SENSOR_READ_INTERVAL_MS);

    Serial.println("[Task_ReadSensors] Multi-node monitoring task active on Core 1.");

    for (;;) {
        // Wait for next cycle
        vTaskDelayUntil(&xLastWakeTime, xFrequency);

        // --------------------------------------------------
        // DEVICE 1: Air Compressor 1
        // --------------------------------------------------
        ElectricalMetrics m1 = pzem.readMetrics(0);
        if (m1.isValid) {
            FaultType activeFault = faultDetector1.checkMetrics(m1);
            bool isTripped = faultDetector1.isRelayTripped();

            // Log details locally in terminal
            Serial.printf("[%s] V: %.1fV | I: %.2fA | P: %.1fW | Fault: %s | Relay: %s\n",
                          DEV1_ID, m1.voltage, m1.current, m1.power, 
                          faultDetector1.getFaultString(activeFault), isTripped ? "OPEN" : "CLOSED");

            TelemetryPayload payload;
            strncpy(payload.deviceId, DEV1_ID, sizeof(payload.deviceId));
            strncpy(payload.deviceName, DEV1_NAME, sizeof(payload.deviceName));
            strncpy(payload.location, DEV1_LOCATION, sizeof(payload.location));
            payload.metrics = m1;
            payload.fault = activeFault;
            payload.relayTripped = isTripped;

            if (xQueueSend(telemetryQueue, &payload, pdMS_TO_TICKS(30)) != pdPASS) {
                Serial.printf("[Task_ReadSensors] Queue overflow for %s\n", DEV1_ID);
            }
        } else {
            Serial.printf("[Task_ReadSensors] Error reading %s (0x%02X)\n", DEV1_ID, DEV1_MODBUS_ADDR);
        }

        // Small inter-device delay to clear the RS485 Modbus bus lines
        vTaskDelay(pdMS_TO_TICKS(80));

        // --------------------------------------------------
        // DEVICE 2: Extraction Fan 2
        // --------------------------------------------------
        ElectricalMetrics m2 = pzem.readMetrics(1);
        if (m2.isValid) {
            FaultType activeFault = faultDetector2.checkMetrics(m2);
            bool isTripped = faultDetector2.isRelayTripped();

            Serial.printf("[%s] V: %.1fV | I: %.2fA | P: %.1fW | Fault: %s | Relay: %s\n",
                          DEV2_ID, m2.voltage, m2.current, m2.power, 
                          faultDetector2.getFaultString(activeFault), isTripped ? "OPEN" : "CLOSED");

            TelemetryPayload payload;
            strncpy(payload.deviceId, DEV2_ID, sizeof(payload.deviceId));
            strncpy(payload.deviceName, DEV2_NAME, sizeof(payload.deviceName));
            strncpy(payload.location, DEV2_LOCATION, sizeof(payload.location));
            payload.metrics = m2;
            payload.fault = activeFault;
            payload.relayTripped = isTripped;

            if (xQueueSend(telemetryQueue, &payload, pdMS_TO_TICKS(30)) != pdPASS) {
                Serial.printf("[Task_ReadSensors] Queue overflow for %s\n", DEV2_ID);
            }
        } else {
            Serial.printf("[Task_ReadSensors] Error reading %s (0x%02X)\n", DEV2_ID, DEV2_MODBUS_ADDR);
        }
    }
}

// ==========================================================
// TASK: Network & IoT Management (Core 0)
// Handles Wi-Fi stability, ArduinoOTA updates, and API posts.
// ==========================================================
void Task_Network(void* pvParameters) {
    Serial.println("[Task_Network] Networking task active on Core 0.");
    
    // Initialize Wi-Fi
    network.begin();

    // Set up OTA
    ArduinoOTA.setHostname("VoltGuard-ESP32-Hub");
    ArduinoOTA.setPassword("VoltGuardOTAAdmin");

    ArduinoOTA.onStart([]() {
        Serial.println("[OTA] Start updating sketch...");
    });
    ArduinoOTA.onEnd([]() {
        Serial.println("\n[OTA] End successful. Restarting...");
    });
    ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
        Serial.printf("[OTA] Progress: %u%%\r", (progress / (total / 100)));
    });
    ArduinoOTA.onError([](ota_error_t error) {
        Serial.printf("[OTA] Error[%u] failed\n", error);
    });

    ArduinoOTA.begin();

    TelemetryPayload incomingPayload;

    for (;;) {
        ArduinoOTA.handle();
        network.handleConnection();

        // Wait for data to arrive from Core 1
        if (xQueueReceive(telemetryQueue, &incomingPayload, pdMS_TO_TICKS(100)) == pdPASS) {
            network.sendTelemetry(
                incomingPayload.metrics, 
                incomingPayload.fault, 
                incomingPayload.relayTripped,
                incomingPayload.deviceId,
                incomingPayload.deviceName,
                incomingPayload.location
            );
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
