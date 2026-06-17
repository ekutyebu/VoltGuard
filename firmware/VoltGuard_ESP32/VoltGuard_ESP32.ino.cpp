# 1 "C:\\Users\\ekuty\\AppData\\Local\\Temp\\tmptlt09l1r"
#include <Arduino.h>
# 1 "C:/Users/ekuty/Desktop/VoltGuard/VoltGuard/firmware/VoltGuard_ESP32/VoltGuard_ESP32.ino"
#include <Arduino.h>
#include <ArduinoOTA.h>
#include "Config.h"
#include "PZEM_Manager.h"
#include "FaultDetector.h"
#include "NetworkManager.h"


struct TelemetryPayload {
    char deviceId[32];
    char deviceName[32];
    char location[32];
    ElectricalMetrics metrics;
    FaultType fault;
    bool relayTripped;
};


QueueHandle_t telemetryQueue = nullptr;


PZEM_Manager pzem(PZEM_RX_PIN, PZEM_TX_PIN);


FaultDetector faultDetector1(RELAY_1_PIN, LED_ALARM_PIN);
FaultDetector faultDetector2(RELAY_2_PIN, LED_ALARM_PIN);

NetworkManager network(WIFI_SSID, WIFI_PASSWORD, BACKEND_API_URL);


void Task_ReadSensors(void* pvParameters);
void Task_Network(void* pvParameters);
void setup();
void loop();
#line 34 "C:/Users/ekuty/Desktop/VoltGuard/VoltGuard/firmware/VoltGuard_ESP32/VoltGuard_ESP32.ino"
void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("==================================================");
    Serial.println("   VoltGuard Industrial Fault Monitor (Multi-Node)");
    Serial.println("==================================================");


    faultDetector1.begin();
    faultDetector2.begin();
    pzem.begin();



    telemetryQueue = xQueueCreate(20, sizeof(TelemetryPayload));
    if (telemetryQueue == nullptr) {
        Serial.println("[System] Critical Error: Failed to create FreeRTOS Queue.");
        while (1) { delay(1000); }
    }


    xTaskCreatePinnedToCore(
        Task_ReadSensors,
        "Task_ReadSensors",
        4096,
        NULL,
        2,
        NULL,
        1
    );


    xTaskCreatePinnedToCore(
        Task_Network,
        "Task_Network",
        8192,
        NULL,
        1,
        NULL,
        0
    );

    Serial.println("[System] FreeRTOS Multitasking Environment started.");
}

void loop() {

    vTaskDelete(NULL);
}






void Task_ReadSensors(void* pvParameters) {
    TickType_t xLastWakeTime = xTaskGetTickCount();
    const TickType_t xFrequency = pdMS_TO_TICKS(SENSOR_READ_INTERVAL_MS);

    Serial.println("[Task_ReadSensors] Multi-node monitoring task active on Core 1.");

    static unsigned long lastQueueTime = 0;
    static FaultType lastFault1 = FAULT_NONE, lastFault2 = FAULT_NONE;
    static bool lastTripped1 = false, lastTripped2 = false;

    for (;;) {

        vTaskDelayUntil(&xLastWakeTime, xFrequency);

        bool timeToQueue = false;
        if (millis() - lastQueueTime >= SERVER_SEND_INTERVAL_MS) {
            timeToQueue = true;
            lastQueueTime = millis();
        }




        ElectricalMetrics m1 = pzem.readMetrics(0);
        if (m1.isValid) {
            FaultType activeFault = faultDetector1.checkMetrics(m1);
            bool isTripped = faultDetector1.isRelayTripped();

            bool faultChanged = (activeFault != lastFault1) || (isTripped != lastTripped1);
            lastFault1 = activeFault;
            lastTripped1 = isTripped;


            Serial.printf("[%s] V: %.1fV | I: %.2fA | P: %.1fW | Fault: %s | Relay: %s\n",
                          DEV1_ID, m1.voltage, m1.current, m1.power,
                          faultDetector1.getFaultString(activeFault), isTripped ? "OPEN" : "CLOSED");

            if (timeToQueue || faultChanged) {
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
            }
        } else {
            Serial.printf("[Task_ReadSensors] Error reading %s (0x%02X)\n", DEV1_ID, DEV1_MODBUS_ADDR);
        }


        vTaskDelay(pdMS_TO_TICKS(80));




        ElectricalMetrics m2 = pzem.readMetrics(1);
        if (m2.isValid) {
            FaultType activeFault = faultDetector2.checkMetrics(m2);
            bool isTripped = faultDetector2.isRelayTripped();

            bool faultChanged = (activeFault != lastFault2) || (isTripped != lastTripped2);
            lastFault2 = activeFault;
            lastTripped2 = isTripped;

            Serial.printf("[%s] V: %.1fV | I: %.2fA | P: %.1fW | Fault: %s | Relay: %s\n",
                          DEV2_ID, m2.voltage, m2.current, m2.power,
                          faultDetector2.getFaultString(activeFault), isTripped ? "OPEN" : "CLOSED");

            if (timeToQueue || faultChanged) {
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
            }
        } else {
            Serial.printf("[Task_ReadSensors] Error reading %s (0x%02X)\n", DEV2_ID, DEV2_MODBUS_ADDR);
        }
    }
}





void Task_Network(void* pvParameters) {
    Serial.println("[Task_Network] Networking task active on Core 0.");


    network.begin();


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