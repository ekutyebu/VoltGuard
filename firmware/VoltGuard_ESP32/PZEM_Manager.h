#ifndef PZEM_MANAGER_H
#define PZEM_MANAGER_H

#include <Arduino.h>
#include "Config.h"

struct ElectricalMetrics {
    float voltage;      // V
    float current;      // A
    float power;        // W (Active Power)
    float energy;       // Wh or kWh (Active Energy)
    float frequency;    // Hz
    float pf;           // Power Factor (0.0 to 1.0)
    bool isValid;       // True if reading is valid, false otherwise
};

class PZEM_Manager {
public:
    PZEM_Manager(int rxPin, int txPin);
    void begin();
    
    // Read metrics for a specific device index
    ElectricalMetrics readMetrics(int deviceIndex);
    
    // Reset energy for a specific device
    void resetEnergy(int deviceIndex);

    int getActiveNodeCount() const { return _activeNodeCount; }
    uint8_t getNodeAddress(int index) const { return _addresses[index]; }

private:
    int _rxPin;
    int _txPin;
    
    // Energy accumulators for simulation instances
    float _accumulatedEnergy[MAX_NODES]; 
    
    unsigned long _lastReadTime;
    
    int _activeNodeCount;
    uint8_t _addresses[MAX_NODES];
    
#if !SIMULATE_PZEM
    // Pointers to the physical PZEM004Tv30 instances
    void* _pzems[MAX_NODES];
#endif

    ElectricalMetrics generateSimulation(int deviceIndex);
};

#endif // PZEM_MANAGER_H
