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
#if !SIMULATE_PZEM
    _pzemSerial = nullptr;
#endif
}

void PZEM_Manager::begin() {
    _lastReadTime = millis();
#if !SIMULATE_PZEM
    // Initialize Hardware Serial 2 ONCE for the entire Modbus bus
    // IMPORTANT: We call begin() here and never again. The 4-argument PZEM constructor
    // also calls serial.begin() internally which destroys the bus — so we must use
    // the 2-argument constructor (HardwareSerial&, addr) for all subsequent instantiation.
    Serial2.begin(9600, SERIAL_8N1, _rxPin, _txPin);
    _pzemSerial = &Serial2;
    
    Serial.println("[Discovery] Scanning Modbus bus for active PZEM nodes...");
    Serial.println("[Discovery] Allowing 3s bus warm-up...");
    delay(3000); // Give sensors time to fully power up
    
    _activeNodeCount = 0;
    for (uint8_t addr = MODBUS_SCAN_START; addr <= MODBUS_SCAN_END; addr++) {
        if (_activeNodeCount >= MAX_NODES) break;
        
        Serial.printf("[Discovery] Probing address 0x%02X...\n", addr);
        
        // Use 2-argument constructor — does NOT call serial.begin() internally
        // This is the key fix: keeps Serial2 stable between probes
        PZEM004Tv30* testPzem = new PZEM004Tv30(*_pzemSerial, addr);
        
        // Try reading voltage 3 times with 500ms gaps
        bool found = false;
        for (int attempt = 0; attempt < 3 && !found; attempt++) {
            delay(500);
            float v = testPzem->voltage();
            if (!isnan(v) && v > 0.0f) {
                found = true;
            }
        }
        
        if (found) {
            Serial.printf("[Discovery] FOUND PZEM Node at Address: 0x%02X\n", addr);
            _pzems[_activeNodeCount] = testPzem;
            _addresses[_activeNodeCount] = addr;
            _activeNodeCount++;
        } else {
            // No response after 3 attempts — nothing at this address
            delete testPzem;
        }
    }
    
    Serial.printf("[Discovery] Complete. %d active node(s) found.\n", _activeNodeCount);
    if (_activeNodeCount == 0) {
        Serial.println("[Discovery] WARNING: No PZEM sensors detected!");
        Serial.println("[Discovery] Check: 1) Power to sensors  2) TX/RX wiring  3) Modbus addresses are 0x01-0x0A");
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
