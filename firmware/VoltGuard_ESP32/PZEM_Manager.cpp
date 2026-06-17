#include "PZEM_Manager.h"
#include "Config.h"

#if !SIMULATE_PZEM
#include <PZEM004Tv30.h>
#endif

PZEM_Manager::PZEM_Manager(int rxPin, int txPin) 
    : _rxPin(rxPin), _txPin(txPin), 
      _lastReadTime(0), _activeNodeCount(0) {
    for (int i = 0; i < MAX_NODES; i++) {
        _accumulatedEnergy[i] = 0.0f;
#if !SIMULATE_PZEM
        _pzems[i] = nullptr;
#endif
    }
}

void PZEM_Manager::begin() {
    _lastReadTime = millis();
#if !SIMULATE_PZEM
    // The PZEM004Tv30 library (v1.1.2) only has one real constructor:
    //   PZEM004Tv30(HardwareSerial& port, uint8_t rx, uint8_t tx, uint8_t addr)
    // This internally calls serial.begin() on EVERY instantiation.
    //
    // FIX: Pre-allocate ALL probe objects FIRST (so all serial.begin() calls
    // happen in a burst), then flush the bus and let it settle BEFORE probing.
    // This is the same pattern the old 2-device firmware used and it worked.
    
    const int SCAN_COUNT = MODBUS_SCAN_END - MODBUS_SCAN_START + 1;
    
    // --- Phase 1: Create all candidates (serial.begin() called N times total) ---
    Serial.println("[Discovery] Pre-allocating PZEM probe objects...");
    PZEM004Tv30* candidates[10];
    uint8_t candidateAddrs[10];
    int candidateCount = 0;
    
    for (int i = 0; i < SCAN_COUNT && candidateCount < 10; i++) {
        uint8_t addr = (uint8_t)(MODBUS_SCAN_START + i);
        candidates[candidateCount] = new PZEM004Tv30(Serial2, _rxPin, _txPin, addr);
        candidateAddrs[candidateCount] = addr;
        candidateCount++;
    }
    
    // --- Phase 2: Flush RX buffer, then let bus fully settle ---
    while (Serial2.available()) Serial2.read();
    Serial.println("[Discovery] Bus flushed. Waiting 4s for Modbus to settle...");
    delay(4000);
    
    // --- Phase 3: Probe each pre-allocated object ---
    _activeNodeCount = 0;
    for (int i = 0; i < candidateCount; i++) {
        if (_activeNodeCount >= MAX_NODES) {
            delete candidates[i];
            continue;
        }
        
        Serial.printf("[Discovery] Probing 0x%02X... ", candidateAddrs[i]);
        
        float v = candidates[i]->voltage();
        if (!isnan(v) && v > 0.0f) {
            Serial.printf("FOUND! %.1fV\n", v);
            _pzems[_activeNodeCount] = candidates[i];
            _addresses[_activeNodeCount] = candidateAddrs[i];
            _activeNodeCount++;
        } else {
            Serial.println("no response.");
            delete candidates[i];
        }
    }
    
    Serial.printf("[Discovery] Complete. %d active node(s).\n", _activeNodeCount);
    if (_activeNodeCount == 0) {
        Serial.println("[Discovery] WARNING: No sensors found!");
        Serial.println("[Discovery] Check: 1) Power to PZEM  2) RX/TX wiring  3) Modbus addresses 0x01-0x0A");
    }

#else
    Serial.println("[PZEM] SIMULATOR ACTIVE. Mocking 2 nodes.");
    _activeNodeCount = 2;
    _addresses[0] = 0x01;
    _addresses[1] = 0x02;
#endif
}

ElectricalMetrics PZEM_Manager::readMetrics(int deviceIndex) {
    unsigned long now = millis();
    float elapsedSeconds = (now - _lastReadTime) / 1000.0f;
    
    if (deviceIndex == 0) {
        _lastReadTime = now;
    }

#if SIMULATE_PZEM
    ElectricalMetrics m = generateSimulation(deviceIndex);
    
    if (m.isValid) {
        float powerKW = m.power / 1000.0f;
        float elapsedHours = elapsedSeconds / 3600.0f;
        _accumulatedEnergy[deviceIndex] += powerKW * elapsedHours;
        m.energy = _accumulatedEnergy[deviceIndex];
    }
    return m;
#else
    if (deviceIndex < 0 || deviceIndex >= _activeNodeCount) {
        ElectricalMetrics m;
        m.isValid = false;
        return m;
    }

    PZEM004Tv30* pzem = (PZEM004Tv30*)_pzems[deviceIndex];
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

    if (isnan(m.voltage) || isnan(m.current) || isnan(m.power) || isnan(m.frequency) || isnan(m.pf)) {
        m.isValid = false;
    } else {
        m.isValid = true;
    }

    return m;
#endif
}

void PZEM_Manager::resetEnergy(int deviceIndex) {
    if (deviceIndex >= 0 && deviceIndex < MAX_NODES) {
        _accumulatedEnergy[deviceIndex] = 0.0f;
    }
    
#if !SIMULATE_PZEM
    if (deviceIndex >= 0 && deviceIndex < _activeNodeCount) {
        PZEM004Tv30* pzem = (PZEM004Tv30*)_pzems[deviceIndex];
        if (pzem != nullptr) {
            pzem->resetEnergy();
            Serial.printf("[PZEM] Reset physical energy counter for Node Address 0x%02X\n", _addresses[deviceIndex]);
        }
    }
#else
    Serial.printf("[PZEM] Reset simulated energy counter for index %d\n", deviceIndex);
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
