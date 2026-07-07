'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { 
  AlertTriangle, 
  CheckCircle, 
  Filter, 
  Clock, 
  Cpu,
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

  // Load stored filters on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedDevice = localStorage.getItem('voltguard_filter_device_id');
      if (storedDevice) setFilterDevice(storedDevice);
      
      const storedStatus = localStorage.getItem('voltguard_filter_status');
      if (storedStatus) setFilterStatus(storedStatus);
    }
  }, []);

  // 1. Session verification
  useEffect(() => {
    async function verifySession() {
      try {
        const res = await fetch('/api/auth/me');
        if (!res.ok) { router.replace('/login'); return; }
        const data = await res.json();
        setUser(data.user);
      } catch (err) { router.replace('/login'); }
    }
    verifySession();
  }, [router]);

  // 2. Fetch Devices
  useEffect(() => {
    async function fetchDevicesList() {
      try {
        const res = await fetch('/api/devices');
        if (res.ok) { const data = await res.json(); setDevices(data); }
      } catch (err) { console.error('Failed to load device listing', err); }
    }
    if (user) fetchDevicesList();
  }, [user]);

  // 3. Fetch Alarm Logs
  const fetchAlarmLogs = useCallback(async () => {
    setLoading(true);
    let url = '/api/alarms?';
    if (filterDevice) url += `deviceId=${filterDevice}&`;
    if (filterStatus) url += `status=${filterStatus}&`;
    try {
      const res = await fetch(url);
      if (res.ok) { const data = await res.json(); setAlarms(data); }
      else { setErrorMsg('Failed to load alarm archives.'); }
    } catch (err) { setErrorMsg('Network error querying database.'); }
    finally { setLoading(false); }
  }, [filterDevice, filterStatus]);

  useEffect(() => { if (user) fetchAlarmLogs(); }, [user, fetchAlarmLogs]);

  // 4. Handle State Actions
  const handleAlarmAction = async (alarmId, action) => {
    setActionLoading(true);
    try {
      const res = await fetch('/api/alarms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alarmId, action }),
      });
      if (res.ok) { fetchAlarmLogs(); }
      else { const data = await res.json(); alert(data.error || 'Action failed.'); }
    } catch (err) { console.error(err); }
    finally { setActionLoading(false); }
  };

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

  const faultColor = (type) => {
    const critical = ['SHORT_CIRCUIT', 'OVERCURRENT', 'OVERLOAD'];
    return critical.includes(type) ? 'var(--color-red)' : 'var(--color-amber)';
  };

  const statusClass = (s) => {
    if (s === 'ACTIVE') return 'badge badge-fault';
    if (s === 'ACKNOWLEDGED') return 'badge badge-warning';
    return 'badge badge-online';
  };

  const AlarmActions = ({ alarm }) => (
    <div className="alarm-actions">
      {alarm.status === 'ACTIVE' && (
        <>
          <button
            id={`ack-alarm-${alarm.id}`}
            onClick={() => handleAlarmAction(alarm.id, 'ACKNOWLEDGE')}
            disabled={actionLoading}
            className="btn btn-outline"
            style={{ padding: '5px 12px', fontSize: '0.75rem' }}
          >
            Ack
          </button>
          <button
            id={`resolve-alarm-${alarm.id}`}
            onClick={() => handleAlarmAction(alarm.id, 'RESOLVE')}
            disabled={actionLoading}
            className="btn btn-cyan"
            style={{ padding: '5px 12px', fontSize: '0.75rem' }}
          >
            Resolve
          </button>
        </>
      )}
      {alarm.status === 'ACKNOWLEDGED' && (
        <button
          id={`resolve-ack-alarm-${alarm.id}`}
          onClick={() => handleAlarmAction(alarm.id, 'RESOLVE')}
          disabled={actionLoading}
          className="btn btn-cyan"
          style={{ padding: '5px 12px', fontSize: '0.75rem' }}
        >
          Resolve
        </button>
      )}
      {alarm.status === 'RESOLVED' && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: 'var(--color-green)', fontWeight: '600' }}>
          <CheckCircle size={14} />Closed
        </span>
      )}
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--bg-main)', paddingBottom: '40px' }}>
      <Header user={user} />

      <main className="main-content" style={{ maxWidth: '1280px', margin: '0 auto', padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>

        {/* PAGE HEADER */}
        <div className="page-header-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', letterSpacing: '0.02em' }}>Protection Alarm Archive</h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Historical audit logs of electrical safety breaches and relay actions.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            <Layers size={15} />
            <span>{alarms.length} record{alarms.length !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* FILTER TOOLBAR */}
        <section className="glass-panel filter-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderRadius: 'var(--radius-md)', flexWrap: 'wrap', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Filter size={16} color="var(--text-muted)" />
            <span style={{ fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Filter Logs:</span>
          </div>

          <div className="filter-inputs-grid" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '180px' }}>
              <select
                id="filter-device-select"
                value={filterDevice}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterDevice(val);
                  localStorage.setItem('voltguard_filter_device_id', val);
                }}
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '0.85rem' }}
              >
                <option value="">All Devices</option>
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                ))}
              </select>
            </div>

            <div style={{ width: '160px' }}>
              <select
                id="filter-status-select"
                value={filterStatus}
                onChange={(e) => {
                  const val = e.target.value;
                  setFilterStatus(val);
                  localStorage.setItem('voltguard_filter_status', val);
                }}
                className="form-input"
                style={{ padding: '8px 12px', fontSize: '0.85rem' }}
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">ACTIVE</option>
                <option value="ACKNOWLEDGED">ACKNOWLEDGED</option>
                <option value="RESOLVED">RESOLVED</option>
              </select>
            </div>

            <button
              id="clear-filters-btn"
              onClick={() => { 
                setFilterDevice(''); 
                setFilterStatus(''); 
                localStorage.removeItem('voltguard_filter_device_id');
                localStorage.removeItem('voltguard_filter_status');
              }}
              className="btn btn-outline"
              style={{ padding: '8px 16px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
            >
              Reset
            </button>
          </div>
        </section>

        {errorMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: '500' }} className="badge-fault" id="alarms-error-alert">
            <AlertTriangle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* DESKTOP TABLE — hidden on mobile via CSS */}
        <section className="glass-panel alarms-desktop-table" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr>
                  {['ID', 'Device', 'Fault Type', 'Value vs Limit', 'Trigger Time', 'Duration', 'Status', 'Action'].map(h => (
                    <th key={h} style={{ padding: '14px 16px', borderBottom: '2px solid var(--border-muted)', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '50px 16px' }}>Querying alarm registers...</td></tr>
                ) : alarms.length === 0 ? (
                  <tr><td colSpan="8" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '50px 16px' }}>No alarm logs found matching filters.</td></tr>
                ) : (
                  alarms.map((alarm) => (
                    <tr key={alarm.id} id={`alarm-row-${alarm.id}`} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>#{alarm.id}</td>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <strong style={{ fontSize: '0.85rem' }}>{alarm.device.name}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{alarm.deviceId}</span>
                        </div>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: '700', color: faultColor(alarm.type), fontFamily: 'var(--font-mono)' }}>{alarm.type}</span>
                      </td>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                        <strong>{alarm.value}</strong>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}> (Lim: {alarm.threshold})</span>
                      </td>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
                        {new Date(alarm.timestamp).toLocaleString()}
                      </td>
                      <td style={{ padding: '13px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
                        {getDuration(alarm.timestamp, alarm.resolvedAt)}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <span className={statusClass(alarm.status)}>{alarm.status}</span>
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        <AlarmActions alarm={alarm} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* MOBILE CARD VIEW — hidden on desktop via CSS */}
        <section className="alarms-mobile-cards">
          {loading ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-md)' }}>
              Querying alarm registers...
            </div>
          ) : alarms.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-md)' }}>
              No alarm logs found matching filters.
            </div>
          ) : (
            alarms.map((alarm) => (
              <div key={alarm.id} id={`alarm-card-${alarm.id}`} className="glass-panel alarm-mobile-card">
                {/* Card Header: Fault type + Status */}
                <div className="alarm-card-header">
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: faultColor(alarm.type), fontFamily: 'var(--font-mono)' }}>
                    {alarm.type}
                  </span>
                  <span className={statusClass(alarm.status)}>{alarm.status}</span>
                </div>

                {/* Device info */}
                <div className="alarm-card-device">
                  <Cpu size={13} color="var(--color-cyan)" />
                  <div>
                    <strong style={{ fontSize: '0.88rem' }}>{alarm.device.name}</strong>
                    <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{alarm.deviceId}</span>
                  </div>
                </div>

                {/* Key metrics row */}
                <div className="alarm-card-metrics">
                  <div className="alarm-card-metric-item">
                    <span className="alarm-card-metric-label">Value</span>
                    <span className="alarm-card-metric-value mono-num" style={{ color: faultColor(alarm.type) }}>{alarm.value}</span>
                  </div>
                  <div className="alarm-card-metric-item">
                    <span className="alarm-card-metric-label">Limit</span>
                    <span className="alarm-card-metric-value mono-num">{alarm.threshold}</span>
                  </div>
                  <div className="alarm-card-metric-item">
                    <span className="alarm-card-metric-label">Duration</span>
                    <span className="alarm-card-metric-value mono-num">{getDuration(alarm.timestamp, alarm.resolvedAt)}</span>
                  </div>
                </div>

                {/* Timestamp */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  <Clock size={11} />
                  {new Date(alarm.timestamp).toLocaleString()}
                </div>

                {/* Actions */}
                <div style={{ marginTop: '4px', borderTop: '1px solid var(--border-muted)', paddingTop: '10px' }}>
                  <AlarmActions alarm={alarm} />
                </div>
              </div>
            ))
          )}
        </section>

      </main>
    </div>
  );
}
