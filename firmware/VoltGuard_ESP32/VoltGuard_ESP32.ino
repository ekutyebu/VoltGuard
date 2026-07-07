#include <Arduino.h>
#include <ArduinoOTA.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include "Config.h"
#include "PZEM_Manager.h"
#include "FaultDetector.h"
#include "NetworkManager.h"
#include <WiFi.h>

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

// Array of independent protection loops for discovered nodes
FaultDetector* detectors[MAX_NODES];

NetworkManager network(WIFI_SSID, WIFI_PASSWORD, BACKEND_API_URL);

// LCD Instance
LiquidCrystal_I2C lcd(LCD_I2C_ADDR, LCD_COLS, LCD_ROWS);

// Task Declarations
void Task_ReadSensors(void* pvParameters);
void Task_Network(void* pvParameters);

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("==================================================");
    Serial.println("   VoltGuard Industrial Fault Monitor (Multi-Node)");
    Serial.println("==================================================");

    // Initialize custom I2C pins for the LCD monitor
    Wire.begin(LCD_SDA_PIN, LCD_SCL_PIN);
    lcd.init();
    lcd.backlight();
    lcd.setCursor(0, 0);
    lcd.print("VoltGuard Hub");
    lcd.setCursor(0, 1);
    lcd.print("Initializing...");

    // Initialize sensor drivers (This runs the Discovery process)
    pzem.begin();

    // Dynamically allocate FaultDetectors for the discovered active nodes
    int activeCount = pzem.getActiveNodeCount();
    
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("VoltGuard Hub");
    lcd.setCursor(0, 1);
    if (activeCount == 0) {
        lcd.print("No Sensors Found");
    } else {
        char nodesMsg[16];
        sprintf(nodesMsg, "Active Nodes: %d", activeCount);
        lcd.print(nodesMsg);
    }
    delay(2000);

    for (int i = 0; i < activeCount; i++) {
        // Assign physical relays to the first two nodes, the rest get -1 (no relay)
        int rPin = (i == 0) ? RELAY_1_PIN : (i == 1) ? RELAY_2_PIN : -1;
        detectors[i] = new FaultDetector(rPin, LED_ALARM_PIN);
        detectors[i]->begin();
    }

    // Create a FreeRTOS queue to hold telemetry readings for transmission
    // Queue handles up to 20 payloads (enough for high frequency uploads)
    telemetryQueue = xQueueCreate(20, sizeof(TelemetryPayload));
    if (telemetryQueue == nullptr) {
        Serial.println("[System] Critical Error: Failed to create FreeRTOS Queue.");
        lcd.clear();
        lcd.print("System Error");
        lcd.setCursor(0, 1);
        lcd.print("Queue Failed");
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

    static unsigned long lastQueueTime = 0;
    static FaultType lastFaults[MAX_NODES];
    static bool lastTripped[MAX_NODES];
    static bool initialized = false;
    
    if (!initialized) {
        for(int i=0; i<MAX_NODES; i++) {
            lastFaults[i] = FAULT_NONE;
            lastTripped[i] = false;
        }
        initialized = true;
    }

    // Get the base MAC address to uniquely identify this ESP32
    uint8_t mac[6];
    WiFi.macAddress(mac);
    char macStr[13];
    sprintf(macStr, "%02X%02X%02X%02X%02X%02X", mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

    for (;;) {
        // Wait for next cycle
        vTaskDelayUntil(&xLastWakeTime, xFrequency);

        bool timeToQueue = false;
        if (millis() - lastQueueTime >= SERVER_SEND_INTERVAL_MS) {
            timeToQueue = true;
            lastQueueTime = millis();
        }

        int activeCount = pzem.getActiveNodeCount();
        for (int i = 0; i < activeCount; i++) {
            uint8_t addr = pzem.getNodeAddress(i);
            ElectricalMetrics m = pzem.readMetrics(i);
            
            if (m.isValid) {
                // Force current, power, and pf to 0 if the relay is tripped (load disconnected)
                // or if the measured current is below a small no-load threshold (< 0.05A)
                if (detectors[i]->isRelayTripped() || m.current < 0.05f) {
                    m.current = 0.0f;
                    m.power = 0.0f;
                    m.pf = 0.0f;
                }

                FaultType activeFault = detectors[i]->checkMetrics(m);
                bool isTripped = detectors[i]->isRelayTripped();
                
                bool faultChanged = (activeFault != lastFaults[i]) || (isTripped != lastTripped[i]);
                lastFaults[i] = activeFault;
                lastTripped[i] = isTripped;

                // Dynamically generate ID and default name based on MAC + Modbus Address
                char devId[32];
                sprintf(devId, "VG_%s_%02X", macStr, addr);
                
                char devName[32];
                sprintf(devName, "Sensor Node 0x%02X", addr);

                // Log details locally in terminal
                Serial.printf("[%s] V: %.1fV | I: %.2fA | P: %.1fW | Fault: %s | Relay: %s\n",
                              devId, m.voltage, m.current, m.power, 
                              detectors[i]->getFaultString(activeFault), isTripped ? "OPEN" : "CLOSED");

                if (timeToQueue || faultChanged) {
                    TelemetryPayload payload;
                    strncpy(payload.deviceId, devId, sizeof(payload.deviceId));
                    strncpy(payload.deviceName, devName, sizeof(payload.deviceName));
                    strncpy(payload.location, "Auto Discovered", sizeof(payload.location));
                    payload.metrics = m;
                    payload.fault = activeFault;
                    payload.relayTripped = isTripped;

                    if (xQueueSend(telemetryQueue, &payload, pdMS_TO_TICKS(30)) != pdPASS) {
                        Serial.printf("[Task_ReadSensors] Queue overflow for %s\n", devId);
                    }
                }
            } else {
                Serial.printf("[Task_ReadSensors] Error reading Node Address 0x%02X\n", addr);
            }

            // Small inter-device delay to clear the RS485 Modbus bus lines
            vTaskDelay(pdMS_TO_TICKS(80));
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
    bool hasSensors = (pzem.getActiveNodeCount() > 0);
    unsigned long lastStatusUpdate = 0;

    for (;;) {
        ArduinoOTA.handle();
        network.handleConnection();

        bool hasData = false;

        // Wait for data to arrive from Core 1
        if (xQueueReceive(telemetryQueue, &incomingPayload, pdMS_TO_TICKS(100)) == pdPASS) {
            hasData = true;
            
            // Print metrics on I2C LCD monitor
            lcd.clear();
            const char* idPtr = incomingPayload.deviceId;
            const char* lastUnderscore = strrchr(idPtr, '_');
            const char* displayId = lastUnderscore ? (lastUnderscore + 1) : idPtr;
            
            lcd.setCursor(0, 0);
            lcd.printf("Node %s: %.1fV", displayId, incomingPayload.metrics.voltage);
            
            lcd.setCursor(0, 1);
            if (incomingPayload.relayTripped) {
                FaultDetector fd(-1, -1);
                lcd.printf("TRIP! %s", fd.getFaultString(incomingPayload.fault));
            } else {
                lcd.printf("%.2fA  %.0fW", incomingPayload.metrics.current, incomingPayload.metrics.power);
            }

            // Send telemetry to server and capture any threshold updates from the backend
            ThresholdConfigs newThresholds = network.sendTelemetry(
                incomingPayload.metrics, 
                incomingPayload.fault, 
                incomingPayload.relayTripped,
                incomingPayload.deviceId,
                incomingPayload.deviceName,
                incomingPayload.location
            );

            // If the server returned updated thresholds, find the matching detector and apply them.
            // This allows the user to change limits in the dashboard UI and have them
            // propagate to the ESP32 protection engine within 2 seconds.
            if (newThresholds.valid) {
                int activeCount = pzem.getActiveNodeCount();
                for (int i = 0; i < activeCount; i++) {
                    char devId[32];
                    uint8_t mac[6];
                    WiFi.macAddress(mac);
                    char macStr[13];
                    sprintf(macStr, "%02X%02X%02X%02X%02X%02X",
                            mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
                    sprintf(devId, "VG_%s_%02X", macStr, pzem.getNodeAddress(i));
                    if (strcmp(devId, incomingPayload.deviceId) == 0) {
                        detectors[i]->updateThresholds(
                            newThresholds.minVoltage,
                            newThresholds.maxVoltage,
                            newThresholds.maxCurrent,
                            newThresholds.maxPower,
                            newThresholds.minPF
                        );
                        break;
                    }
                }
            }
        }

        // If no sensors are active, update status screen periodically
        if (!hasData && !hasSensors && (millis() - lastStatusUpdate > 2000)) {
            lastStatusUpdate = millis();
            lcd.clear();
            lcd.setCursor(0, 0);
            lcd.print("VoltGuard Hub");
            lcd.setCursor(0, 1);
            if (network.isConnected()) {
                lcd.print("WiFi Connected");
            } else {
                lcd.print("WiFi Offline");
            }
        }

        vTaskDelay(pdMS_TO_TICKS(10));
    }
}
