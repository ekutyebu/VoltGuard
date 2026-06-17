'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { 
  AlertTriangle, 
  CheckCircle, 
  Search, 
  Filter, 
  Clock, 
  Calendar,
  Layers
} from 'lucide-react';

export default function AlarmsLogPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [alarms, setAlarms] = useState([]);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Filters state
  const [filterDevice, setFilterDevice] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

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

  // 2. Fetch Devices (for filter selection dropdown)
  useEffect(() => {
    async function fetchDevicesList() {
      try {
        const res = await fetch('/api/devices');
        if (res.ok) {
          const data = await res.json();
          setDevices(data);
        }
      } catch (err) {
        console.error('Failed to load device listing', err);
      }
    }
    if (user) {
      fetchDevicesList();
    }
  }, [user]);

  // 3. Fetch Alarm Logs
  const fetchAlarmLogs = useCallback(async () => {
    setLoading(true);
    let url = '/api/alarms?';
    if (filterDevice) url += `deviceId=${filterDevice}&`;
    if (filterStatus) url += `status=${filterStatus}&`;

    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAlarms(data);
      } else {
        setErrorMsg('Failed to load alarm archives.');
      }
    } catch (err) {
      setErrorMsg('Network error querying database.');
    } finally {
      setLoading(false);
    }
  }, [filterDevice, filterStatus]);

  useEffect(() => {
    if (user) {
      fetchAlarmLogs();
    }
  }, [user, fetchAlarmLogs]);

  // 4. Handle State Actions (Acknowledge / Resolve)
  const handleAlarmAction = async (alarmId, action) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/alarms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alarmId, action }),
      });
      if (res.ok) {
        fetchAlarmLogs();
      } else {
        const data = await res.json();
        alert(data.error || 'Action failed.');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Format fault duration
  const getDuration = (start, end) => {
    if (!end) return 'Active';
    const diffMs = new Date(end) - new Date(start);
    const diffSecs = Math.floor(diffMs / 1000);
    if (diffSecs < 60) return `${diffSecs}s`;
    const diffMins = Math.floor(diffSecs / 60);
    if (diffMins < 60) return `${diffMins}m ${diffSecs % 60}s`;
    const diffHours = Math.floor(diffMins / 60);
    return `${diffHours}h ${diffMins % 60}m`;
  };

  if (!user) return null;

  return (
    <div style={pageContainerStyle}>
      <Header user={user} />

      <main style={mainContentStyle}>
        <div style={pageHeaderStyle}>
          <div>
            <h1 style={pageTitleStyle}>Protection Alarm Archive</h1>
            <p style={pageSubtitleStyle}>Historical audit logs of electrical safety breaches and relay actions.</p>
          </div>
        </div>

        {/* ALARMS FILTERS TOOLBAR */}
        <section style={filterToolbarStyle} className="glass-panel">
          <div style={filterGroupStyle}>
            <Filter size={16} color="var(--text-muted)" />
            <span style={filterToolbarLabelStyle}>Filter Logs:</span>
          </div>

          <div style={filterInputsGridStyle}>
            <div style={selectWrapperStyle}>
              <select
                id="filter-device-select"
                value={filterDevice}
                onChange={(e) => setFilterDevice(e.target.value)}
                style={selectStyle}
              >
                <option value="">All Devices</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                ))}
              </select>
            </div>

            <div style={selectWrapperStyle}>
              <select
                id="filter-status-select"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                style={selectStyle}
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </div>
            
            <button 
              id="clear-filters-btn"
              onClick={() => { setFilterDevice(''); setFilterStatus(''); }}
              className="btn btn-outline"
              style={{ padding: '8px 16px', fontSize: '0.85rem' }}
            >
              Reset Filters
            </button>
          </div>
        </section>

        {errorMsg && (
          <div style={alertContainerStyle} className="badge-fault" id="alarms-error-alert">
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ALARMS AUDIT TABLE */}
        <section className="glass-panel" style={{ overflow: 'hidden' }}>
          <div className="custom-table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Alarm ID</th>
                  <th>Device / Location</th>
                  <th>Fault Category</th>
                  <th>Violation Value</th>
                  <th>Trigger Time</th>
                  <th>Duration</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Operator Action</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="8" style={tableFeedbackStyle}>Querying alarm registers...</td>
                  </tr>
                ) : alarms.length === 0 ? (
                  <tr>
                    <td colSpan="8" style={tableFeedbackStyle}>No alarm logs found matching filters.</td>
                  </tr>
                ) : (
                  alarms.map((alarm) => (
                    <tr key={alarm.id} id={`alarm-row-${alarm.id}`}>
                      <td className="mono-num">#{alarm.id}</td>
                      <td>
                        <div style={deviceMetaStyle}>
                          <strong>{alarm.device.name}</strong>
                          <span style={locationStyle} className="mono-num">{alarm.deviceId}</span>
                        </div>
                      </td>
                      <td>
                        <span style={faultTypeStyle(alarm.type)}>
                          {alarm.type}
                        </span>
                      </td>
                      <td className="mono-num">
                        <strong>{alarm.value}</strong> 
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}> (Limit: {alarm.threshold})</span>
                      </td>
                      <td className="mono-num" style={{ fontSize: '0.8rem' }}>
                        {new Date(alarm.timestamp).toLocaleString()}
                      </td>
                      <td className="mono-num" style={{ fontSize: '0.8rem' }}>
                        {getDuration(alarm.timestamp, alarm.resolvedAt)}
                      </td>
                      <td>
                        <span className={`badge badge-${alarm.status.toLowerCase()}`}>
                          {alarm.status}
                        </span>
                      </td>
                      <td>
                        <div style={actionsContainerStyle}>
                          {alarm.status === 'ACTIVE' && (
                            <>
                              <button
                                id={`ack-alarm-${alarm.id}`}
                                onClick={() => handleAlarmAction(alarm.id, 'ACKNOWLEDGE')}
                                disabled={actionLoading}
                                className="btn btn-outline"
                                style={actionBtnStyle}
                              >
                                Ack
                              </button>
                              <button
                                id={`resolve-alarm-${alarm.id}`}
                                onClick={() => handleAlarmAction(alarm.id, 'RESOLVE')}
                                disabled={actionLoading}
                                className="btn btn-cyan"
                                style={{ ...actionBtnStyle, padding: '4px 8px' }}
                              >
                                Resolve
                              </button>
                            </>
                          )}
                          {alarm.status === 'ACKNOWLEDGED' && (
                            <button
                              id={`resolve-alarm-${alarm.id}`}
                              onClick={() => handleAlarmAction(alarm.id, 'RESOLVE')}
                              disabled={actionLoading}
                              className="btn btn-cyan"
                              style={{ ...actionBtnStyle, padding: '4px 8px' }}
                            >
                              Resolve
                            </button>
                          )}
                          {alarm.status === 'RESOLVED' && (
                            <span style={resolvedPlaceholderStyle}>
                              <CheckCircle size={14} color="var(--color-green)" />
                              <span>Closed</span>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

// Inline styles for Alarms Log Page
const pageContainerStyle = {
  minHeight: '100vh',
  backgroundColor: 'var(--bg-main)',
  paddingBottom: '40px',
};

const mainContentStyle = {
  maxWidth: '1280px',
  margin: '0 auto',
  padding: '0 24px',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
};

const pageHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: '10px',
};

const pageTitleStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: '1.75rem',
  fontWeight: '700',
  letterSpacing: '0.02em',
};

const pageSubtitleStyle = {
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  marginTop: '4px',
};

const filterToolbarStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 24px',
  borderRadius: 'var(--radius-md)',
  flexWrap: 'wrap',
  gap: '16px',
};

const filterGroupStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
};

const filterToolbarLabelStyle = {
  fontSize: '0.8rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const filterInputsGridStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const selectWrapperStyle = {
  width: '180px',
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
  width: '100%',
  cursor: 'pointer',
};

const alertContainerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 18px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.9rem',
  fontWeight: '500',
};

const tableFeedbackStyle = {
  textAlign: 'center',
  color: 'var(--text-muted)',
  padding: '50px 16px',
};

const deviceMetaStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
};

const locationStyle = {
  fontSize: '0.75rem',
  color: 'var(--text-muted)',
};

const faultTypeStyle = (type) => {
  const isCritical = ['SHORT_CIRCUIT', 'OVERCURRENT', 'OVERLOAD'].includes(type);
  return {
    fontSize: '0.75rem',
    fontWeight: '700',
    color: isCritical ? 'var(--color-red)' : 'var(--color-amber)',
    fontFamily: 'var(--font-mono)',
  };
};

const actionsContainerStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  alignItems: 'center',
};

const actionBtnStyle = {
  padding: '4px 10px',
  fontSize: '0.75rem',
  fontWeight: '600',
};

const resolvedPlaceholderStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  fontSize: '0.75rem',
  color: 'var(--color-green)',
  fontWeight: '600',
};
