'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import Gauge from '@/components/Gauge';
import { 
  Zap, 
  Activity, 
  Gauge as Speedometer, 
  ShieldCheck, 
  AlertTriangle, 
  Cpu, 
  MapPin, 
  RefreshCw,
  Clock
} from 'lucide-react';
import { 
  ResponsiveContainer, 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  Tooltip, 
  CartesianGrid 
} from 'recharts';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Device list and selection
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [deviceData, setDeviceData] = useState(null);
  const [telemetryHistory, setTelemetryHistory] = useState([]);
  
  // Active alarms for the selected device
  const [activeAlarms, setActiveAlarms] = useState([]);
  const [isPolling, setIsPolling] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // 1. Session verification
  useEffect(() => {
    async function verifySession() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) {
          router.replace('/login');
          return;
        }
        const data = await res.json();
        setUser(data.user);
      } catch (err) {
        router.replace('/login');
      }
    }
    verifySession();
  }, [router]);

  // 2. Fetch Devices List
  const fetchDevices = useCallback(async () => {
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
        if (data.length > 0 && !selectedDeviceId) {
          // Default to first device
          setSelectedDeviceId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load device listing', err);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    if (user) {
      fetchDevices();
    }
  }, [user, fetchDevices]);

  // 3. Fetch Telemetry and Alarms for Selected Device
  const fetchDeviceMetrics = useCallback(async () => {
    if (!selectedDeviceId) return;
    try {
      const res = await fetch(`/api/devices/${selectedDeviceId}`);
      if (res.ok) {
        const data = await res.json();
        setDeviceData(data.device);
        setTelemetryHistory(data.telemetry || []);
        
        // Fetch active alarms
        const alarmsRes = await fetch(`/api/alarms?deviceId=${selectedDeviceId}&status=ACTIVE`);
        if (alarmsRes.ok) {
          const alarmsData = await alarmsRes.json();
          setActiveAlarms(alarmsData);
        }
        setErrorMsg('');
      } else {
        setErrorMsg('Node offline or unreachable.');
      }
    } catch (err) {
      console.error('Error fetching metrics', err);
    } finally {
      setLoading(false);
    }
  }, [selectedDeviceId]);

  // Polling loop
  useEffect(() => {
    if (!user || !selectedDeviceId) return;
    
    fetchDeviceMetrics(); // Initial fetch
    
    const interval = setInterval(() => {
      if (isPolling) {
        fetchDeviceMetrics();
      }
    }, 2000); // 2-second polling frequency
    
    return () => clearInterval(interval);
  }, [user, selectedDeviceId, isPolling, fetchDeviceMetrics]);

  // 4. Acknowledge alarm
  const handleAcknowledgeAlarm = async (alarmId) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/alarms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alarmId, action: 'ACKNOWLEDGE' }),
      });
      if (res.ok) {
        // Refresh alarms
        fetchDeviceMetrics();
        fetchDevices();
      }
    } catch (err) {
      console.error('Acknowledge failed', err);
    } finally {
      setActionLoading(false);
    }
  };

  // Get Gauge color based on threshold boundaries
  const getVoltageColor = (v, th) => {
    if (!th) return 'cyan';
    if (v < th.minVoltage || v > th.maxVoltage) return 'red';
    if (v < th.minVoltage + 5.0 || v > th.maxVoltage - 5.0) return 'amber';
    return 'cyan';
  };

  const getCurrentColor = (c, th) => {
    if (!th) return 'green';
    if (c > th.maxCurrent) return 'red';
    if (c > th.maxCurrent * 0.8) return 'amber';
    return 'green';
  };

  const getPFColor = (pf, th) => {
    if (!th) return 'cyan';
    if (pf < th.minPF) return 'amber';
    return 'cyan';
  };

  // Get current active telemetry metrics
  const latestMetrics = telemetryHistory.length > 0 
    ? telemetryHistory[telemetryHistory.length - 1] 
    : { voltage: 0, current: 0, power: 0, energy: 0, frequency: 0, pf: 0, relayTripped: false };

  // System Health Indicator state
  const isSystemFault = activeAlarms.length > 0 || latestMetrics.relayTripped;
  const healthText = latestMetrics.relayTripped 
    ? 'EMERGENCY TRIP: SYSTEM ISOLATED' 
    : isSystemFault 
      ? 'WARNING: PARAMETER VIOLATION DETECTED' 
      : 'ALL PARAMETERS NOMINAL';

  const chartData = telemetryHistory.map(t => ({
    time: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    voltage: t.voltage,
    power: t.power,
  }));

  if (!user) {
    return (
      <div style={loadingContainerStyle}>
        <div style={spinnerStyle} className="pulse-active-cyan"></div>
        <p>Verifying secure mechatronic session...</p>
      </div>
    );
  }

  return (
    <div style={pageContainerStyle}>
      <Header user={user} />
      
      <main style={mainContentStyle} className="main-content">
        {/* TOP STATUS BAR & DEVICE SELECTION */}
        <section style={topBarContainerStyle} className="dashboard-top-bar">
          <div style={selectorGroupStyle} className="glass-panel selector-group">
            <Cpu size={18} color="var(--color-cyan)" />
            <label htmlFor="device-select" style={selectLabelStyle}>Target Node:</label>
            <select
              id="device-select"
              value={selectedDeviceId}
              onChange={(e) => {
                setLoading(true);
                setSelectedDeviceId(e.target.value);
              }}
              style={selectStyle}
            >
              {devices.length === 0 ? (
                <option value="">No Active Nodes Detected</option>
              ) : (
                devices.map(d => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.id})
                  </option>
                ))
              )}
            </select>
            
            <button 
              id="refresh-btn"
              onClick={() => { setLoading(true); fetchDeviceMetrics(); fetchDevices(); }}
              style={refreshBtnStyle}
              title="Force Manual Metrics Refresh"
            >
              <RefreshCw size={15} />
            </button>
          </div>
          
          {/* Health Status Banner */}
          <div 
            style={healthStatusStyle} 
            className={`glass-panel health-status-banner ${isSystemFault ? 'glow-red' : 'glow-cyan'}`}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div 
                style={healthIndicatorBulletStyle(isSystemFault ? 'red' : 'cyan')} 
                className={isSystemFault ? 'pulse-active-red' : 'pulse-active-cyan'}
              ></div>
              <div>
                <span style={healthHeaderStyle}>System Health Monitor</span>
                <h2 style={healthStateTitleStyle}>{healthText}</h2>
              </div>
            </div>
            {deviceData && (
              <div style={metadataStyle} className="dashboard-metadata">
                <div style={metaItemStyle}>
                  <MapPin size={14} color="var(--text-muted)" />
                  <span>{deviceData.location}</span>
                </div>
                <div style={metaItemStyle}>
                  <Clock size={14} color="var(--text-muted)" />
                  <span className="mono-num">
                    {deviceData.status === 'ONLINE' ? 'Polling 2s' : deviceData.status}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>

        {devices.length === 0 ? (
          <div style={emptyStateContainerStyle} className="glass-panel">
            <AlertTriangle size={48} color="var(--color-amber)" style={{ marginBottom: '16px' }} />
            <h3>No Live Telemetry Received Yet</h3>
            <p>Deploy the ESP32 DevKit firmware and point it to this server to begin monitoring electrical loads.</p>
          </div>
        ) : (
          <>
            {/* GRID 1: THREE DIAL GAUGES */}
            <section style={gaugesGridStyle} className="gauges-grid">
              <Gauge 
                value={latestMetrics.voltage}
                min={deviceData?.threshold?.minVoltage || 180}
                max={deviceData?.threshold?.maxVoltage || 260}
                title="Line Voltage"
                unit="V AC"
                color={getVoltageColor(latestMetrics.voltage, deviceData?.threshold)}
              />
              <Gauge 
                value={latestMetrics.current}
                min={0}
                max={deviceData?.threshold?.maxCurrent || 20}
                title="Load Current"
                unit="Amps"
                color={getCurrentColor(latestMetrics.current, deviceData?.threshold)}
              />
              <Gauge 
                value={latestMetrics.pf}
                min={0.5}
                max={1.0}
                title="Power Factor"
                unit="PF"
                color={getPFColor(latestMetrics.pf, deviceData?.threshold)}
              />
            </section>

            {/* GRID 2: CORE ELECTRICAL METRIC CARDS */}
            <section style={metricsGridStyle} className="metrics-grid">
              <div style={metricCardStyle} className="glass-panel">
                <div style={metricHeaderStyle}>
                  <Zap size={20} color="var(--color-amber)" />
                  <span>Active Power</span>
                </div>
                <div style={metricBodyStyle}>
                  <h3 className="mono-num">{latestMetrics.power.toFixed(latestMetrics.power < 1000 ? 1 : 0)}</h3>
                  <span style={metricUnitStyle}>Watts</span>
                </div>
                <div style={metricFooterStyle}>
                  Limit: <span className="mono-num">{deviceData?.threshold?.maxPower} W</span>
                </div>
              </div>

              <div style={metricCardStyle} className="glass-panel">
                <div style={metricHeaderStyle}>
                  <Activity size={20} color="var(--color-cyan)" />
                  <span>Grid Frequency</span>
                </div>
                <div style={metricBodyStyle}>
                  <h3 className="mono-num">{latestMetrics.frequency.toFixed(2)}</h3>
                  <span style={metricUnitStyle}>Hz</span>
                </div>
                <div style={metricFooterStyle}>
                  Stable: <span className="mono-num">~50.0 / 60.0 Hz</span>
                </div>
              </div>

              <div style={metricCardStyle} className="glass-panel">
                <div style={metricHeaderStyle}>
                  <Speedometer size={20} color="var(--color-green)" />
                  <span>Energy Consumption</span>
                </div>
                <div style={metricBodyStyle}>
                  <h3 className="mono-num">{latestMetrics.energy.toFixed(4)}</h3>
                  <span style={metricUnitStyle}>kWh</span>
                </div>
                <div style={metricFooterStyle}>
                  Limit: <span className="mono-num">{deviceData?.threshold?.maxEnergy} kWh</span>
                </div>
              </div>
            </section>

            {/* GRID 3: DUAL-CHANNEL REAL-TIME TIMELINE CHART & ACTIVE ALARMS PANEL */}
            <section style={chartsAlertsGridStyle} className="charts-alerts-grid">
              {/* Chart Panel */}
              <div style={chartPanelStyle} className="glass-panel chart-panel">
                <h3 style={panelTitleStyle}>Real-time Power & Voltage Trends</h3>
                
                <div style={{ width: '100%', height: '300px', marginTop: '15px' }}>
                  {chartData.length === 0 ? (
                    <div style={noDataChartStyle}>Accumulating real-time graph nodes...</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorVoltage" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-cyan)" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="var(--color-cyan)" stopOpacity={0.0}/>
                          </linearGradient>
                          <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="var(--color-amber)" stopOpacity={0.2}/>
                            <stop offset="95%" stopColor="var(--color-amber)" stopOpacity={0.0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-muted)" vertical={false} />
                        <XAxis dataKey="time" stroke="var(--text-muted)" fontSize={10} tickLine={false} />
                        <YAxis yAxisId="left" stroke="var(--color-cyan)" fontSize={10} domain={['dataMin - 10', 'dataMax + 10']} tickLine={false} />
                        <YAxis yAxisId="right" orientation="right" stroke="var(--color-amber)" fontSize={10} tickLine={false} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: 'var(--bg-main)', borderColor: 'var(--border-muted)', borderRadius: 'var(--radius-sm)' }}
                          labelStyle={{ color: 'var(--text-secondary)', fontSize: '11px', fontWeight: 'bold' }}
                          itemStyle={{ fontSize: '12px' }}
                        />
                        <Area yAxisId="left" type="monotone" dataKey="voltage" name="Voltage (V)" stroke="var(--color-cyan)" strokeWidth={2} fillOpacity={1} fill="url(#colorVoltage)" />
                        <Area yAxisId="right" type="monotone" dataKey="power" name="Power (W)" stroke="var(--color-amber)" strokeWidth={2} fillOpacity={1} fill="url(#colorPower)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>

              {/* Active Alarms Panel */}
              <div style={alarmsPanelStyle} className="glass-panel alarms-panel">
                <div style={alarmsHeaderStyle} className="alarms-header">
                  <h3 style={panelTitleStyle}>Active Warning System</h3>
                  <span className="badge badge-warning mono-num">{activeAlarms.length} Active</span>
                </div>
                
                <div style={alarmsListStyle}>
                  {activeAlarms.length === 0 ? (
                    <div style={emptyAlarmsStyle}>
                      <ShieldCheck size={36} color="var(--color-green)" style={{ marginBottom: '10px' }} />
                      <p>Control loop is healthy.</p>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>No active fault classifications.</span>
                    </div>
                  ) : (
                    activeAlarms.map((alarm) => (
                      <div key={alarm.id} style={alarmItemStyle} className="glow-red">
                        <div style={alarmMetaStyle}>
                          <span style={alarmBadgeStyle}>{alarm.type}</span>
                          <span style={alarmTimeStyle} className="mono-num">
                            {new Date(alarm.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p style={alarmDescStyle}>
                          Value: <strong className="mono-num">{alarm.value}</strong> vs Limit: <strong className="mono-num">{alarm.threshold}</strong>
                        </p>
                        <button
                          id={`ack-btn-${alarm.id}`}
                          onClick={() => handleAcknowledgeAlarm(alarm.id)}
                          disabled={actionLoading}
                          style={ackButtonStyle}
                        >
                          Acknowledge
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// Inline Styles for Dashboard View
const pageContainerStyle = {
  minHeight: '100vh',
  backgroundColor: 'var(--bg-main)',
  paddingBottom: '40px',
};

const loadingContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-main)',
  color: 'var(--text-secondary)',
  gap: '16px',
};

const spinnerStyle = {
  width: '40px',
  height: '40px',
  borderRadius: '50%',
  border: '3px solid var(--color-cyan)',
  borderTopColor: 'transparent',
};

const mainContentStyle = {
  maxWidth: '1280px',
  margin: '0 auto',
  padding: '0 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const topBarContainerStyle = {
  display: 'grid',
  gridTemplateColumns: '320px 1fr',
  gap: '20px',
  width: '100%',
};

const selectorGroupStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  padding: '16px 20px',
  borderRadius: 'var(--radius-md)',
};

const selectLabelStyle = {
  fontSize: '0.8rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const selectStyle = {
  background: 'var(--bg-input)',
  border: '1px solid var(--border-muted)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-primary)',
  padding: '8px 12px',
  fontSize: '0.85rem',
  fontWeight: '500',
  outline: 'none',
  flex: '1',
  cursor: 'pointer',
};

const refreshBtnStyle = {
  background: 'transparent',
  border: '1px solid var(--border-muted)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-secondary)',
  padding: '8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all var(--transition-fast)',
};

const healthStatusStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 24px',
  borderRadius: 'var(--radius-md)',
};

const healthIndicatorBulletStyle = (color) => ({
  width: '12px',
  height: '12px',
  borderRadius: '50%',
  backgroundColor: color === 'red' ? 'var(--color-red)' : 'var(--color-cyan)',
});

const healthHeaderStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  fontWeight: '500',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const healthStateTitleStyle = {
  fontSize: '1.05rem',
  fontWeight: '700',
  letterSpacing: '0.02em',
  marginTop: '2px',
};

const metadataStyle = {
  display: 'flex',
  gap: '20px',
};

const metaItemStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
};

const emptyStateContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '60px 40px',
  textAlign: 'center',
  borderRadius: 'var(--radius-md)',
  marginTop: '20px',
};

const gaugesGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
  gap: '20px',
};

const metricsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: '20px',
};

const metricCardStyle = {
  display: 'flex',
  flexDirection: 'column',
  padding: '20px',
  borderRadius: 'var(--radius-md)',
};

const metricHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  fontWeight: '600',
};

const metricBodyStyle = {
  display: 'flex',
  alignItems: 'baseline',
  gap: '6px',
  margin: '16px 0 10px 0',
};

const metricUnitStyle = {
  fontSize: '0.8rem',
  color: 'var(--text-muted)',
};

const metricFooterStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
  borderTop: '1px solid var(--border-muted)',
  paddingTop: '10px',
};

const chartsAlertsGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 360px',
  gap: '20px',
};

const chartPanelStyle = {
  padding: '24px',
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  flexDirection: 'column',
};

const panelTitleStyle = {
  fontSize: '0.95rem',
  fontWeight: '600',
  color: 'var(--text-primary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const noDataChartStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  color: 'var(--text-muted)',
  fontSize: '0.9rem',
};

const alarmsPanelStyle = {
  padding: '24px',
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  flexDirection: 'column',
};

const alarmsHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--border-muted)',
  paddingBottom: '14px',
  marginBottom: '16px',
};

const alarmsListStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
  overflowY: 'auto',
  maxHeight: '260px',
  paddingRight: '4px',
};

const emptyAlarmsStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '40px 10px',
  textAlign: 'center',
  height: '100%',
};

const alarmItemStyle = {
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 14px',
  borderRadius: 'var(--radius-sm)',
  background: 'hsla(355, 85%, 52%, 0.05)',
  border: '1px solid hsla(355, 85%, 52%, 0.15)',
  gap: '6px',
};

const alarmMetaStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
};

const alarmBadgeStyle = {
  fontSize: '0.7rem',
  fontWeight: '700',
  color: 'var(--color-red)',
  fontFamily: 'var(--font-mono)',
};

const alarmTimeStyle = {
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
};

const alarmDescStyle = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
};

const ackButtonStyle = {
  alignSelf: 'flex-end',
  background: 'var(--bg-input)',
  border: '1px solid hsla(355, 85%, 52%, 0.3)',
  color: 'var(--text-primary)',
  padding: '4px 8px',
  borderRadius: '4px',
  fontSize: '0.7rem',
  fontWeight: '600',
  cursor: 'pointer',
  transition: 'all var(--transition-fast)',
};
