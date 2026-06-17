#include "FaultDetector.h"
#include "Config.h"

FaultDetector::FaultDetector(int relayPin, int ledAlarmPin)
    : _relayPin(relayPin), _ledAlarmPin(ledAlarmPin),
      _relayTripped(false), _activeFault(FAULT_NONE),
      _faultCounter(0), _lastTripTime(0) {
    
    // Load fallbacks from config
    _minVoltage = THRESHOLD_MIN_VOLTAGE;
    _maxVoltage = THRESHOLD_MAX_VOLTAGE;
    _maxCurrent = THRESHOLD_MAX_CURRENT;
    _maxPower = THRESHOLD_MAX_POWER;
    _minPF = THRESHOLD_MIN_PF;
}

void FaultDetector::begin() {
    pinMode(_relayPin, OUTPUT);
    pinMode(_ledAlarmPin, OUTPUT);
    
    // Closed by default (Energized relay = path closed = Power ON)
    digitalWrite(_relayPin, HIGH); 
    digitalWrite(_ledAlarmPin, LOW);
    
    Serial.println("[FaultDetector] Local Protection Engine active.");
    Serial.printf("[FaultDetector] Defaults: V(%.1f-%.1fV) Max I(%.1fA) Max P(%.0fW) Min PF(%.2f)\n", 
                  _minVoltage, _maxVoltage, _maxCurrent, _maxPower, _minPF);
}

FaultType FaultDetector::checkMetrics(const ElectricalMetrics& m) {
    if (!m.isValid) {
        return _activeFault; // Maintain current state if reading is invalid
    }

    FaultType currentReadingFault = FAULT_NONE;

    // 1. Instant Trip conditions (e.g. Short Circuit / Current > 1.5x of limit)
    if (m.current > (_maxCurrent * 1.5f)) {
        currentReadingFault = FAULT_SHORT_CIRCUIT;
        tripRelay(currentReadingFault);
        return currentReadingFault;
    }

    // 2. Standard Threshold checks
    if (m.voltage > _maxVoltage) {
        currentReadingFault = FAULT_OVERVOLTAGE;
    } 
    else if (m.voltage < _minVoltage) {
        currentReadingFault = FAULT_UNDERVOLTAGE;
    } 
    else if (m.current > _maxCurrent) {
        currentReadingFault = FAULT_OVERCURRENT;
    } 
    else if (m.power > _maxPower) {
        currentReadingFault = FAULT_OVERLOAD;
    } 
    else if (m.pf < _minPF && m.power > 100.0f) { 
        // Only check low PF if there's active current/power (ignore when device is off)
        currentReadingFault = FAULT_LOW_PF;
    }

    // 3. Debounce Filter Logic
    if (currentReadingFault != FAULT_NONE) {
        _faultCounter++;
        if (_faultCounter >= _faultThresholdLimit && !_relayTripped) {
            tripRelay(currentReadingFault);
        }
    } else {
        if (_faultCounter > 0) {
            _faultCounter--;
        }
        
        // 4. Auto Recovery Logic
        // If relay was tripped, and parameters are normal, and cooldown has expired
        if (_relayTripped && _activeFault != FAULT_SHORT_CIRCUIT) {
            unsigned long elapsed = millis() - _lastTripTime;
            if (elapsed > RELAY_AUTORECOVERY_MS) {
                Serial.println("[FaultDetector] Fault cleared. Cooldown completed. Auto-recovering relay...");
                resetTrip();
            }
        }
    }

    return _activeFault;
}

void FaultDetector::tripRelay(FaultType reason) {
    if (_relayTripped && _activeFault == reason) {
        return; // Already tripped for this reason
    }

    // Open Relay (De-energize = Power OFF)
    digitalWrite(_relayPin, LOW);
    digitalWrite(_ledAlarmPin, HIGH);
    
    _relayTripped = true;
    _activeFault = reason;
    _lastTripTime = millis();
    
    Serial.printf("[FaultDetector] !!! PROTECTION TRIP !!! Reason: %s (Time: %lu)\n", 
                  getFaultString(reason), _lastTripTime);
}

void FaultDetector::resetTrip() {
    digitalWrite(_relayPin, HIGH); // Path closed = Power ON
    digitalWrite(_ledAlarmPin, LOW);
    
    _relayTripped = false;
    _activeFault = FAULT_NONE;
    _faultCounter = 0;
    
    Serial.println("[FaultDetector] Protection reset. Relay closed.");
}

void FaultDetector::updateThresholds(float minV, float maxV, float maxI, float maxW, float minPF) {
    _minVoltage = minV;
    _maxVoltage = maxV;
    _maxCurrent = maxI;
    _maxPower = maxW;
    _minPF = minPF;
    
    Serial.printf("[FaultDetector] Thresholds updated: V(%.1f-%.1f) Max I(%.1f) Max P(%.0f) Min PF(%.2f)\n", 
                  _minVoltage, _maxVoltage, _maxCurrent, _maxPower, _minPF);
}

const char* FaultDetector::getFaultString(FaultType fault) const {
    switch(fault) {
        case FAULT_UNDERVOLTAGE: return "UNDERVOLTAGE";
        case FAULT_OVERVOLTAGE:  return "OVERVOLTAGE";
        case FAULT_OVERCURRENT:  return "OVERCURRENT";
        case FAULT_OVERLOAD:     return "OVERLOAD";
        case FAULT_LOW_PF:       return "LOW_POWER_FACTOR";
        case FAULT_SHORT_CIRCUIT:return "SHORT_CIRCUIT";
        case FAULT_NONE:
        default:                 return "NONE";
    }
}
