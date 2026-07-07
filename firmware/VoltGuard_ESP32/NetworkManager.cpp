#include "NetworkManager.h"
#include <time.h>
#include <WiFiClientSecure.h>

NetworkManager::NetworkManager(const char* ssid, const char* password, const char* apiUrl)
    : _ssid(ssid), _password(password), _apiUrl(apiUrl),
      _wifiConnected(false), _lastWifiCheck(0),
      _bufferHead(0), _bufferTail(0), _bufferCount(0) {
}

void NetworkManager::begin() {
    pinMode(LED_WIFI_PIN, OUTPUT);
    digitalWrite(LED_WIFI_PIN, LOW); // Off initially

    Serial.println("[Network] Initializing Wi-Fi connection...");
    
    // Set Wi-Fi to station mode
    WiFi.mode(WIFI_STA);

    // 1. Add the primary AP passed via constructor
    if (_ssid && strlen(_ssid) > 0) {
        wifiMulti.addAP(_ssid, _password);
        Serial.printf("[Network] Registered primary Wi-Fi AP: %s\n", _ssid);
    }

    // 2. Add additional fallback APs from Config.h
    for (int i = 0; i < WIFI_NETWORK_COUNT; i++) {
        // Avoid adding the primary one twice
        if (_ssid && strcmp(WIFI_NETWORKS[i].ssid, _ssid) == 0) {
            continue;
        }
        wifiMulti.addAP(WIFI_NETWORKS[i].ssid, WIFI_NETWORKS[i].password);
        Serial.printf("[Network] Registered fallback Wi-Fi AP: %s\n", WIFI_NETWORKS[i].ssid);
    }

    Serial.println("[Network] Scanning and connecting to best available network...");
    uint8_t status = wifiMulti.run();
    if (status == WL_CONNECTED) {
        _wifiConnected = true;
        digitalWrite(LED_WIFI_PIN, HIGH);
        Serial.printf("[Network] Wi-Fi Connected! SSID: %s, IP: %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
        syncTime();
    } else {
        Serial.println("[Network] Wi-Fi connection pending. Will retry in background.");
    }
    
    _lastWifiCheck = millis();
}

void NetworkManager::handleConnection() {
    unsigned long now = millis();
    
    // Check current connection status
    if (WiFi.status() == WL_CONNECTED) {
        if (!_wifiConnected) {
            _wifiConnected = true;
            digitalWrite(LED_WIFI_PIN, HIGH); // Steady ON when connected
            Serial.printf("[Network] Wi-Fi Connected! SSID: %s, IP: %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
            syncTime();
            flushBuffer(); // Flush offline data
        }
    } else {
        // If disconnected, trigger connection update using wifiMulti.run()
        if (_wifiConnected || (now - _lastWifiCheck > WIFI_RECONNECT_INTERVAL_MS)) {
            _wifiConnected = false;
            digitalWrite(LED_WIFI_PIN, LOW); // LED OFF
            Serial.println("[Network] Wi-Fi disconnected or connection lost. Re-scanning & connecting...");
            
            uint8_t status = wifiMulti.run();
            if (status == WL_CONNECTED) {
                _wifiConnected = true;
                digitalWrite(LED_WIFI_PIN, HIGH);
                Serial.printf("[Network] Reconnected to SSID: %s, IP: %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
                syncTime();
                flushBuffer();
            } else {
                Serial.println("[Network] Connection attempt unsuccessful. Will retry later.");
            }
            _lastWifiCheck = now;
        }
    }
}

void NetworkManager::syncTime() {
    Serial.println("[Network] Synchronizing time with NTP...");
    configTime(0, 0, "pool.ntp.org", "time.nist.gov");
    
    int retry = 0;
    time_t now = time(nullptr);
    while (now < 8 * 3600 * 2 && retry < 15) {
        delay(200);
        now = time(nullptr);
        retry++;
    }
    
    if (now > 8 * 3600 * 2) {
        struct tm timeinfo;
        gmtime_r(&now, &timeinfo);
        Serial.printf("[Network] Time synchronized. GMT: %04d-%02d-%02d %02d:%02d:%02d\n",
                      timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday,
                      timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
    } else {
        Serial.println("[Network] NTP synchronization timed out.");
    }
}

unsigned long NetworkManager::getEpochTime() {
    time_t now = time(nullptr);
    if (now < 8 * 3600 * 2) {
        return 0;
    }
    return (unsigned long)now;
}

ThresholdConfigs NetworkManager::sendTelemetry(const ElectricalMetrics& m, FaultType fault, bool relayTripped,
                                   const char* deviceId, const char* deviceName, const char* location) {
    ThresholdConfigs result = { false, 0, 0, 0, 0, 0 };
    
    handleConnection();
    
    unsigned long timestamp = getEpochTime();
    
    if (!_wifiConnected) {
        pushToBuffer(m, fault, relayTripped, deviceId, deviceName, location);
        return result;
    }
    
    String payload = serializeMetrics(m, fault, relayTripped, timestamp, deviceId, deviceName, location);
    String responseBody = "";
    bool success = uploadPayload(payload, responseBody);
    
    if (success) {
        if (_bufferCount > 0) {
            flushBuffer();
        }
        // Parse the thresholds from the server response JSON
        // Expected JSON: {"thresholds":{"minVoltage":180.0,"maxVoltage":255.0,...}}
        if (responseBody.indexOf("thresholds") > -1) {
            result.valid      = true;
            result.minVoltage = parseJsonFloat(responseBody, "minVoltage");
            result.maxVoltage = parseJsonFloat(responseBody, "maxVoltage");
            result.maxCurrent = parseJsonFloat(responseBody, "maxCurrent");
            result.maxPower   = parseJsonFloat(responseBody, "maxPower");
            result.minPF      = parseJsonFloat(responseBody, "minPF");
            Serial.printf("[Network] Threshold sync received: V(%.1f-%.1fV) I(%.1fA) P(%.0fW) PF(%.2f)\n",
                          result.minVoltage, result.maxVoltage, result.maxCurrent, result.maxPower, result.minPF);
        }
    } else {
        pushToBuffer(m, fault, relayTripped, deviceId, deviceName, location);
    }
    
    return result;
}

void NetworkManager::pushToBuffer(const ElectricalMetrics& m, FaultType fault, bool relayTripped,
                                  const char* deviceId, const char* deviceName, const char* location) {
    BufferedReading reading;
    reading.metrics = m;
    reading.fault = fault;
    reading.relayTripped = relayTripped;
    reading.epochTime = getEpochTime();
    
    // Copy string identifiers safely
    strncpy(reading.deviceId, deviceId, sizeof(reading.deviceId) - 1);
    reading.deviceId[sizeof(reading.deviceId) - 1] = '\0';
    
    strncpy(reading.deviceName, deviceName, sizeof(reading.deviceName) - 1);
    reading.deviceName[sizeof(reading.deviceName) - 1] = '\0';
    
    strncpy(reading.location, location, sizeof(reading.location) - 1);
    reading.location[sizeof(reading.location) - 1] = '\0';

    _buffer[_bufferHead] = reading;
    _bufferHead = (_bufferHead + 1) % RING_BUFFER_SIZE;
    
    if (_bufferCount < RING_BUFFER_SIZE) {
        _bufferCount++;
    } else {
        _bufferTail = (_bufferTail + 1) % RING_BUFFER_SIZE;
        Serial.println("[Buffer] Warning: Ring buffer full, overwriting oldest reading.");
    }
    
    Serial.printf("[Buffer] Telemetry queued for %s. Active queue size: %d/%d\n", 
                  deviceId, _bufferCount, RING_BUFFER_SIZE);
}

bool NetworkManager::popFromBuffer(BufferedReading& reading) {
    if (_bufferCount == 0) {
        return false;
    }
    
    reading = _buffer[_bufferTail];
    _bufferTail = (_bufferTail + 1) % RING_BUFFER_SIZE;
    _bufferCount--;
    
    return true;
}

void NetworkManager::flushBuffer() {
    if (_bufferCount == 0) return;
    
    Serial.printf("[Buffer] Uploading queued offline telemetry data (%d records)...\n", _bufferCount);
    
    BufferedReading reading;
    String discard = "";
    while (_bufferCount > 0) {
        reading = _buffer[_bufferTail];
        
        String payload = serializeMetrics(reading.metrics, reading.fault, reading.relayTripped, 
                                          reading.epochTime, reading.deviceId, reading.deviceName, reading.location);
        
        if (uploadPayload(payload, discard)) {
            _bufferTail = (_bufferTail + 1) % RING_BUFFER_SIZE;
            _bufferCount--;
            delay(100);
        } else {
            Serial.println("[Buffer] Flush halted. Server remains unreachable.");
            break;
        }
    }
    
    Serial.printf("[Buffer] Flush finished. Current queue size: %d\n", _bufferCount);
}

bool NetworkManager::uploadPayload(const String& jsonPayload, String& responseBody) {
    HTTPClient http;
    bool success = false;
    String urlStr = String(_apiUrl);
    responseBody = "";
    
    // Use secure client for HTTPS (Vercel) endpoints
    if (urlStr.startsWith("https://")) {
        WiFiClientSecure *secureClient = new WiFiClientSecure;
        secureClient->setInsecure(); // Skip CA cert validation (acceptable for IoT)
        http.begin(*secureClient, _apiUrl);
        http.addHeader("Content-Type", "application/json");
        http.setTimeout(HTTP_TIMEOUT_MS);
        
        int httpResponseCode = http.POST(jsonPayload);
        if (httpResponseCode > 0) {
            responseBody = http.getString();
            if (httpResponseCode == 200 || httpResponseCode == 201) {
                success = true;
            } else {
                Serial.printf("[HTTP] Warning: POST responded with code %d. Response: %s\n", 
                              httpResponseCode, responseBody.c_str());
            }
        } else {
            Serial.printf("[HTTP] Error: POST request failed. Reason: %s\n", 
                          http.errorToString(httpResponseCode).c_str());
        }
        http.end();
        delete secureClient; // Free allocated memory
    } else {
        http.begin(_apiUrl);
        http.addHeader("Content-Type", "application/json");
        http.setTimeout(HTTP_TIMEOUT_MS);
        
        int httpResponseCode = http.POST(jsonPayload);
        if (httpResponseCode > 0) {
            responseBody = http.getString();
            if (httpResponseCode == 200 || httpResponseCode == 201) {
                success = true;
            } else {
                Serial.printf("[HTTP] Warning: POST responded with code %d. Response: %s\n", 
                              httpResponseCode, responseBody.c_str());
            }
        } else {
            Serial.printf("[HTTP] Error: POST request failed. Reason: %s\n", 
                          http.errorToString(httpResponseCode).c_str());
        }
        http.end();
    }
    return success;
}

// Simple JSON float extractor — finds key and reads the numeric value after ':'
float NetworkManager::parseJsonFloat(const String& json, const char* key) {
    String searchKey = String("\"") + key + "\"";
    int keyIdx = json.indexOf(searchKey);
    if (keyIdx < 0) return 0.0f;
    int colonIdx = json.indexOf(':', keyIdx + searchKey.length());
    if (colonIdx < 0) return 0.0f;
    return json.substring(colonIdx + 1).toFloat();
}

String NetworkManager::serializeMetrics(const ElectricalMetrics& m, FaultType fault, bool relayTripped, 
                                        unsigned long timestamp, const char* deviceId, 
                                        const char* deviceName, const char* location) {
    FaultDetector detector(RELAY_1_PIN, LED_ALARM_PIN); // Reference for string mapping
    String faultStr = detector.getFaultString(fault);

    String json = "{";
    json += "\"deviceId\":\"" + String(deviceId) + "\",";
    json += "\"deviceName\":\"" + String(deviceName) + "\",";
    json += "\"location\":\"" + String(location) + "\",";
    json += "\"voltage\":" + String(m.voltage, 2) + ",";
    json += "\"current\":" + String(m.current, 2) + ",";
    json += "\"power\":" + String(m.power, 2) + ",";
    json += "\"energy\":" + String(m.energy, 4) + ",";
    json += "\"frequency\":" + String(m.frequency, 2) + ",";
    json += "\"pf\":" + String(m.pf, 2) + ",";
    json += "\"fault\":\"" + faultStr + "\",";
    json += "\"relayTripped\":" + String(relayTripped ? "true" : "false") + ",";
    json += "\"wifiSSID\":\"" + WiFi.SSID() + "\",";
    json += "\"wifiRSSI\":" + String(WiFi.RSSI());
    
    if (timestamp > 0) {
        json += ",\"timestamp\":" + String(timestamp);
    }
    json += "}";
    
    return json;
}
