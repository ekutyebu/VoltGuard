#ifndef NETWORK_MANAGER_H
#define NETWORK_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include "PZEM_Manager.h"
#include "FaultDetector.h"
#include "Config.h"

struct BufferedReading {
    char deviceId[32];
    char deviceName[32];
    char location[32];
    ElectricalMetrics metrics;
    FaultType fault;
    bool relayTripped;
    unsigned long epochTime; // Unix timestamp
};

// Holds the thresholds returned by the server on each telemetry POST.
// The ESP32 uses this to dynamically update protection limits from the UI.
struct ThresholdConfigs {
    bool valid;         // true if server returned a valid thresholds block
    float minVoltage;
    float maxVoltage;
    float maxCurrent;
    float maxPower;
    float minPF;
};

class NetworkManager {
public:
    NetworkManager(const char* ssid, const char* password, const char* apiUrl);
    void begin();
    
    // Maintain connection state machine
    void handleConnection();
    
    // Send telemetry to server. Returns ThresholdConfigs with any updated limits from the backend.
    ThresholdConfigs sendTelemetry(const ElectricalMetrics& m, FaultType fault, bool relayTripped, 
                       const char* deviceId, const char* deviceName, const char* location);
    
    // Returns status indicators
    bool isConnected() const { return _wifiConnected; }
    int getBufferSize() const { return _bufferCount; }
    
    // Sync local RTC/Time with NTP
    void syncTime();
    unsigned long getEpochTime();

private:
    const char* _ssid;
    const char* _password;
    const char* _apiUrl;
    
    WiFiMulti wifiMulti;
    bool _wifiConnected;
    unsigned long _lastWifiCheck;
    
    // Local telemetry buffering (Ring Buffer)
    BufferedReading _buffer[RING_BUFFER_SIZE];
    int _bufferHead; // Next insert index
    int _bufferTail; // Next read/upload index
    int _bufferCount; // Total items in buffer
    
    void pushToBuffer(const ElectricalMetrics& m, FaultType fault, bool relayTripped,
                      const char* deviceId, const char* deviceName, const char* location);
    bool popFromBuffer(BufferedReading& reading);
    void flushBuffer();
    
    bool uploadPayload(const String& jsonPayload, String& responseBody);
    float parseJsonFloat(const String& json, const char* key);
    String serializeMetrics(const ElectricalMetrics& m, FaultType fault, bool relayTripped, 
                            unsigned long timestamp, const char* deviceId, 
                            const char* deviceName, const char* location);
};

#endif // NETWORK_MANAGER_H
