#ifndef FAULT_DETECTOR_H
#define FAULT_DETECTOR_H

#include <Arduino.h>
#include "PZEM_Manager.h"

enum FaultType {
    FAULT_NONE = 0,
    FAULT_UNDERVOLTAGE,
    FAULT_OVERVOLTAGE,
    FAULT_OVERCURRENT,
    FAULT_OVERLOAD,
    FAULT_LOW_PF,
    FAULT_SHORT_CIRCUIT
};

class FaultDetector {
public:
    FaultDetector(int relayPin, int ledAlarmPin);
    void begin();
    
    // Checks metrics and returns the current active fault type.
    // Also controls the physical relay and alarm LED state.
    FaultType checkMetrics(const ElectricalMetrics& m);
    
    // Dynamically update the configuration thresholds
    void updateThresholds(float minV, float maxV, float maxI, float maxW, float minPF);
    
    // Manual reset of the trip status
    void resetTrip();
    
    // Status getters
    bool isRelayTripped() const { return _relayTripped; }
    FaultType getActiveFault() const { return _activeFault; }
    const char* getFaultString(FaultType fault) const;
    
    float getMinVoltage() const { return _minVoltage; }
    float getMaxVoltage() const { return _maxVoltage; }
    float getMaxCurrent() const { return _maxCurrent; }
    float getMaxPower() const { return _maxPower; }
    float getMinPF() const { return _minPF; }

private:
    int _relayPin;
    int _ledAlarmPin;
    
    // Active thresholds
    float _minVoltage;
    float _maxVoltage;
    float _maxCurrent;
    float _maxPower;
    float _minPF;
    
    bool _relayTripped;
    FaultType _activeFault;
    
    // For fault verification (debounce counter)
    int _faultCounter;
    const int _faultThresholdLimit = 2; // Fault must occur in 2 consecutive readings to trigger alarm
    
    // Auto recovery timer
    unsigned long _lastTripTime;
    
    void tripRelay(FaultType reason);
};

#endif // FAULT_DETECTOR_H
