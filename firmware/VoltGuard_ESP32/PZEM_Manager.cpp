#include "PZEM_Manager.h"
#include "Config.h"

#if !SIMULATE_PZEM
#include <PZEM004Tv30.h>
#endif

PZEM_Manager::PZEM_Manager(int rxPin, int txPin) 
    : _rxPin(rxPin), _txPin(txPin), 
      _accumulatedEnergy1(0.0f), _accumulatedEnergy2(0.0f), 
      _lastReadTime(0) {
#if !SIMULATE_PZEM
    _pzem1 = nullptr;
    _pzem2 = nullptr;
#endif
}

void PZEM_Manager::begin() {
    _lastReadTime = millis();
#if !SIMULATE_PZEM
    // Initialize Hardware Serial 2 once for the Modbus shared bus
    HardwareSerial* pzemSerial = &Serial2;
    pzemSerial->begin(9600, SERIAL_8N1, _rxPin, _txPin);
    
    // Construct separate objects referencing distinct Modbus addresses
    _pzem1 = new PZEM004Tv30(*pzemSerial, _rxPin, _txPin, DEV1_MODBUS_ADDR);
    _pzem2 = new PZEM004Tv30(*pzemSerial, _rxPin, _txPin, DEV2_MODBUS_ADDR);
    
    Serial.printf("[PZEM] Dual Nodes initialized on Serial2. Addr1: 0x%02X, Addr2: 0x%02X\n", 
                  DEV1_MODBUS_ADDR, DEV2_MODBUS_ADDR);
#else
    Serial.println("[PZEM] DUAL SIMULATOR ACTIVE. Generating Compressor & Fan profiles.");
#endif
}

ElectricalMetrics PZEM_Manager::readMetrics(int deviceIndex) {
    unsigned long now = millis();
    float elapsedSeconds = (now - _lastReadTime) / 1000.0f;
    
    // We only update _lastReadTime on the first index read to maintain timing coherence
    if (deviceIndex == 0) {
        _lastReadTime = now;
    }

#if SIMULATE_PZEM
    ElectricalMetrics m = generateSimulation(deviceIndex);
    
    // Accumulate energy individually
    if (m.isValid) {
        float powerKW = m.power / 1000.0f;
        float elapsedHours = elapsedSeconds / 3600.0f;
        if (deviceIndex == 0) {
            _accumulatedEnergy1 += powerKW * elapsedHours;
            m.energy = _accumulatedEnergy1;
        } else {
            _accumulatedEnergy2 += powerKW * elapsedHours;
            m.energy = _accumulatedEnergy2;
        }
    }
    return m;
#else
    PZEM004Tv30* pzem = (deviceIndex == 0) ? (PZEM004Tv30*)_pzem1 : (PZEM004Tv30*)_pzem2;
    ElectricalMetrics m;
    
    if (pzem == nullptr) {
        m.isValid = false;
        return m;
    }

    m.voltage = pzem->voltage();
    m.current = pzem->current();
    m.power = pzem->power();
    m.energy = pzem->energy();
    m.frequency = pzem->frequency();
    m.pf = pzem->pf();

    // Check validation (if connection is unplugged or address wrong, returns NaN)
    if (isnan(m.voltage) || isnan(m.current) || isnan(m.power) || isnan(m.frequency) || isnan(m.pf)) {
        m.isValid = false;
        // Serial.printf("[PZEM] Node %d read timeout.\n", deviceIndex + 1);
    } else {
        m.isValid = true;
    }

    return m;
#endif
}

void PZEM_Manager::resetEnergy(int deviceIndex) {
    if (deviceIndex == 0) _accumulatedEnergy1 = 0.0f;
    else _accumulatedEnergy2 = 0.0f;
    
#if !SIMULATE_PZEM
    PZEM004Tv30* pzem = (deviceIndex == 0) ? (PZEM004Tv30*)_pzem1 : (PZEM004Tv30*)_pzem2;
    if (pzem != nullptr) {
        pzem->resetEnergy();
        Serial.printf("[PZEM] Reset physical energy counter for Node %d\n", deviceIndex + 1);
    }
#else
    Serial.printf("[PZEM] Reset simulated energy counter for Node %d\n", deviceIndex + 1);
#endif
}

#if SIMULATE_PZEM
ElectricalMetrics PZEM_Manager::generateSimulation(int deviceIndex) {
    ElectricalMetrics m;
    m.isValid = true;
    
    unsigned long sec = millis() / 1000;
    
    // Add minor jitter
    float voltJitter = ((float)(rand() % 100) - 50.0f) / 120.0f; // -0.4V to +0.4V
    float ampJitter = ((float)(rand() % 100) - 50.0f) / 1000.0f; // -0.05A to +0.05A
    float freqJitter = ((float)(rand() % 100) - 50.0f) / 1000.0f; // -0.05Hz to +0.05Hz

    if (deviceIndex == 0) {
        // ==========================================
        // PROFILE 1: Heavy Industrial Air Compressor
        // ==========================================
        // 120 seconds test cycle (Idle, Running, Overvoltage, Overload, Low PF)
        unsigned long cycleTime = sec % 120;
        
        float baseVoltage = 230.0f;
        float baseCurrent = 1.2f;
        float baseFrequency = 50.0f;
        float basePF = 0.85f;
        
        if (cycleTime < 40) {
            // Compressor Idle
            baseVoltage = 232.0f;
            baseCurrent = 0.8f; 
            basePF = 0.62f; 
        } 
        else if (cycleTime >= 40 && cycleTime < 90) {
            // Compressor Active Load
            baseVoltage = 226.5f;
            baseCurrent = 8.8f;
            basePF = 0.92f;
        }
        else if (cycleTime >= 90 && cycleTime < 100) {
            // Overvoltage Surge Event
            baseVoltage = 257.0f; 
            baseCurrent = 4.2f;
            basePF = 0.88f;
        }
        else if (cycleTime >= 100 && cycleTime < 110) {
            // Overload Trip Event
            baseVoltage = 217.0f;
            baseCurrent = 17.8f; 
            basePF = 0.94f;
        }
        else {
            // Poor PF Event
            baseVoltage = 230.0f;
            baseCurrent = 5.5f;
            basePF = 0.58f;
        }
        
        m.voltage = baseVoltage + voltJitter;
        m.current = baseCurrent + ampJitter;
        m.frequency = baseFrequency + freqJitter;
        m.pf = basePF;
    } 
    else {
        // ==========================================
        // PROFILE 2: Extraction Fan (Steady Load)
        // ==========================================
        // A smaller ventilation load drawing steady power with occasional voltage dips
        float baseVoltage = 229.0f;
        float baseCurrent = 2.4f; // ~500W
        float baseFrequency = 50.0f;
        float basePF = 0.88f;
        
        // Sync voltage dips briefly when the Compressor (Device 1) kicks in (at 40-90s)
        unsigned long cycleTime = sec % 120;
        if (cycleTime >= 40 && cycleTime < 90) {
            baseVoltage = 226.0f; // Voltage drop on shared feeder
        }
        
        // Simulate a minor undervoltage spike on Fan Feeder between 70-80s of cycle
        if (cycleTime >= 70 && cycleTime < 80) {
            baseVoltage = 191.0f; // Triggers UNDERVOLTAGE (<195V)
        }

        m.voltage = baseVoltage + voltJitter;
        m.current = baseCurrent + ampJitter;
        m.frequency = baseFrequency + freqJitter;
        m.pf = basePF;
    }

    // Calculate Active Power (P = V * I * PF)
    m.power = m.voltage * m.current * m.pf;
    
    return m;
}
#endif
