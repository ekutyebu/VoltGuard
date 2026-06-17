#ifndef PZEM_MANAGER_H
#define PZEM_MANAGER_H

#include <Arduino.h>

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
    
    // Read metrics for a specific device (0 = Device 1, 1 = Device 2)
    ElectricalMetrics readMetrics(int deviceIndex);
    
    // Reset energy for both devices
    void resetEnergy(int deviceIndex);

private:
    int _rxPin;
    int _txPin;
    
    // Energy accumulators for both simulation instances
    float _accumulatedEnergy1; 
    float _accumulatedEnergy2; 
    
    unsigned long _lastReadTime;
    
#if !SIMULATE_PZEM
    // Pointers to the two physical PZEM004Tv30 instances on the same Serial bus
    void* _pzem1;
    void* _pzem2;
#endif

    ElectricalMetrics generateSimulation(int deviceIndex);
};

#endif // PZEM_MANAGER_H
