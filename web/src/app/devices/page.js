'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import {
  Plus,
  Settings2,
  Trash2,
  Check,
  X,
  AlertCircle,
  ShieldAlert,
  MapPin,
  Cpu,
} from 'lucide-react';

export default function DevicesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '', location: '',
    minVoltage: 195.0, maxVoltage: 253.0,
    maxCurrent: 15.0, maxPower: 3300,
    minPF: 0.80, maxEnergy: 10000,
  });

  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState({ id: '', name: '', location: '' });

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

  async function fetchDevices() {
    try {
      const res = await fetch('/api/devices');
      if (res.ok) { const data = await res.json(); setDevices(data); }
      else { setErrorMsg('Failed to load device catalog.'); }
    } catch (err) { setErrorMsg('Network error while querying database.'); }
    finally { setLoading(false); }
  }

  useEffect(() => { if (user) fetchDevices(); }, [user]);

  const startEditing = (device) => {
    setEditingDeviceId(device.id);
    setEditForm({
      name: device.name,
      location: device.location,
      minVoltage: device.threshold?.minVoltage || 195.0,
      maxVoltage: device.threshold?.maxVoltage || 253.0,
      maxCurrent: device.threshold?.maxCurrent || 15.0,
      maxPower: device.threshold?.maxPower || 3300,
      minPF: device.threshold?.minPF || 0.80,
      maxEnergy: device.threshold?.maxEnergy || 10000,
    });
    setErrorMsg(''); setSuccessMsg('');
    // Scroll to the edit panel
    setTimeout(() => document.getElementById('thresholds-edit-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (user.role !== 'ADMIN') { setErrorMsg('Unauthorized: Only administrators can modify thresholds.'); return; }
    try {
      const res = await fetch(`/api/devices/${editingDeviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editForm.name, location: editForm.location, thresholds: { minVoltage: editForm.minVoltage, maxVoltage: editForm.maxVoltage, maxCurrent: editForm.maxCurrent, maxPower: editForm.maxPower, minPF: editForm.minPF, maxEnergy: editForm.maxEnergy } }),
      });
      if (res.ok) { setSuccessMsg('Configurations written successfully!'); setEditingDeviceId(null); fetchDevices(); }
      else { const data = await res.json(); setErrorMsg(data.error || 'Failed to update thresholds.'); }
    } catch (err) { setErrorMsg('Database save command failed.'); }
  };

  const handleAddDevice = async (e) => {
    e.preventDefault();
    if (user.role !== 'ADMIN') { setErrorMsg('Admins only.'); return; }
    if (!addForm.id || !addForm.name || !addForm.location) { setErrorMsg('All fields are required.'); return; }
    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });
      if (res.ok) { setSuccessMsg('New node provisioned successfully!'); setIsAdding(false); setAddForm({ id: '', name: '', location: '' }); fetchDevices(); }
      else { const data = await res.json(); setErrorMsg(data.error || 'Failed to register node.'); }
    } catch (err) { setErrorMsg('API command failed.'); }
  };

  const handleDeleteDevice = async (id) => {
    if (user.role !== 'ADMIN') return;
    if (!confirm(`Are you sure you want to remove device "${id}"? This will purge all associated telemetry logs.`)) return;
    try {
      const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
      if (res.ok) { setSuccessMsg('Device purged from registry.'); fetchDevices(); }
      else { setErrorMsg('Failed to delete device.'); }
    } catch (err) { setErrorMsg('Network error.'); }
  };

  if (!user) return null;
  const isAdmin = user.role === 'ADMIN';

  const statusBadge = (status) => {
    const cls = status === 'ONLINE' ? 'badge-online' : status === 'FAULT' ? 'badge-fault' : 'badge-offline';
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  const DeviceActions = ({ device }) => (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      <button
        id={`edit-thresholds-${device.id}`}
        onClick={() => startEditing(device)}
        className="btn btn-outline"
        style={{ padding: '6px 12px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px' }}
      >
        <Settings2 size={14} />
        <span>{isAdmin ? 'Configure' : 'View'}</span>
      </button>
      {isAdmin && (
        <button
          id={`delete-device-${device.id}`}
          onClick={() => handleDeleteDevice(device.id)}
          className="btn btn-outline"
          style={{ padding: '6px 10px', fontSize: '0.8rem', borderColor: 'var(--color-red-glow)', color: 'var(--color-red)' }}
        >
          <Trash2 size={14} />
        </button>
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
            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', letterSpacing: '0.02em' }}>Machine Nodes Registry</h1>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Define electrical overload and voltage thresholds per mechatronic asset.</p>
          </div>
          {isAdmin && !isAdding && (
            <button
              id="provision-node-btn"
              onClick={() => { setIsAdding(true); setErrorMsg(''); setSuccessMsg(''); }}
              className="btn btn-cyan"
            >
              <Plus size={18} />
              <span>Provision Node</span>
            </button>
          )}
        </div>

        {/* FEEDBACK */}
        {errorMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: '500' }} className="badge-fault" id="devices-error-alert">
            <AlertCircle size={16} /><span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 18px', borderRadius: 'var(--radius-sm)', fontSize: '0.9rem', fontWeight: '500' }} className="badge-online" id="devices-success-alert">
            <Check size={16} /><span>{successMsg}</span>
          </div>
        )}

        {/* PROVISION FORM */}
        {isAdding && (
          <section className="glass-panel glow-cyan form-card" style={{ padding: '24px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-muted)', paddingBottom: '12px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Register Machine Node</h3>
              <button onClick={() => setIsAdding(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddDevice} className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '16px', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Device ID</label>
                <input id="new-device-id" type="text" className="form-input" placeholder="e.g. DEV_VOLTGUARD_003" value={addForm.id} onChange={(e) => setAddForm({ ...addForm, id: e.target.value.toUpperCase() })} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Asset Name</label>
                <input id="new-device-name" type="text" className="form-input" placeholder="e.g. Ventilation Fan B" value={addForm.name} onChange={(e) => setAddForm({ ...addForm, name: e.target.value })} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</label>
                <input id="new-device-location" type="text" className="form-input" placeholder="e.g. Warehouse Sector 4" value={addForm.location} onChange={(e) => setAddForm({ ...addForm, location: e.target.value })} required />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', height: '100%' }}>
                <button type="submit" className="btn btn-cyan" id="save-new-device-btn" style={{ width: '100%' }}>Save</button>
              </div>
            </form>
          </section>
        )}

        {/* DESKTOP TABLE */}
        <section className="glass-panel devices-desktop-table" style={{ overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto', width: '100%' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
              <thead>
                <tr>
                  {['Device Info', 'Location', 'Status', 'Limits (V / A / W)', 'Actions'].map(h => (
                    <th key={h} style={{ padding: '14px 16px', borderBottom: '2px solid var(--border-muted)', color: 'var(--text-secondary)', fontWeight: '600', textTransform: 'uppercase', fontSize: '0.72rem', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>Loading device registry...</td></tr>
                ) : devices.length === 0 ? (
                  <tr><td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 16px' }}>No machines registered in database registry.</td></tr>
                ) : (
                  devices.map((device) => {
                    const th = device.threshold;
                    return (
                      <tr key={device.id} id={`device-row-${device.id}`} style={{ borderBottom: '1px solid var(--border-muted)' }}>
                        <td style={{ padding: '13px 16px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <strong>{device.name}</strong>
                            <span style={{ fontSize: '0.7rem', color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>{device.id}</span>
                          </div>
                        </td>
                        <td style={{ padding: '13px 16px', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{device.location}</td>
                        <td style={{ padding: '13px 16px' }}>{statusBadge(device.status)}</td>
                        <td style={{ padding: '13px 16px', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          {th ? `${th.minVoltage}-${th.maxVoltage}V | ${th.maxCurrent}A | ${th.maxPower}W` : 'Default Fallbacks'}
                        </td>
                        <td style={{ padding: '13px 16px' }}>
                          <DeviceActions device={device} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* MOBILE CARD VIEW */}
        <section className="devices-mobile-cards">
          {loading ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-md)' }}>Loading device registry...</div>
          ) : devices.length === 0 ? (
            <div className="glass-panel" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)', borderRadius: 'var(--radius-md)' }}>No machines registered.</div>
          ) : (
            devices.map((device) => {
              const th = device.threshold;
              return (
                <div key={device.id} id={`device-card-${device.id}`} className="glass-panel device-mobile-card">
                  {/* Card Header */}
                  <div className="device-card-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Cpu size={16} color="var(--color-cyan)" />
                      <div>
                        <strong style={{ fontSize: '0.95rem' }}>{device.name}</strong>
                        <span style={{ display: 'block', fontSize: '0.68rem', color: 'var(--color-cyan)', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>{device.id}</span>
                      </div>
                    </div>
                    {statusBadge(device.status)}
                  </div>

                  {/* Location */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                    <MapPin size={13} color="var(--text-muted)" />
                    {device.location}
                  </div>

                  {/* Threshold summary */}
                  {th && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 'var(--radius-sm)', padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: 'var(--text-secondary)', border: '1px solid var(--border-muted)' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '4px' }}>Protection Limits</span>
                      {th.minVoltage}–{th.maxVoltage} V &nbsp;|&nbsp; {th.maxCurrent} A &nbsp;|&nbsp; {th.maxPower} W
                    </div>
                  )}

                  {/* Actions */}
                  <div style={{ borderTop: '1px solid var(--border-muted)', paddingTop: '10px' }}>
                    <DeviceActions device={device} />
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* THRESHOLD EDITING PANEL */}
        {editingDeviceId && (
          <section className="glass-panel glow-cyan form-card" id="thresholds-edit-panel" style={{ padding: '24px', borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-muted)', paddingBottom: '12px', flexWrap: 'wrap', gap: '10px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Configure: <code style={{ color: 'var(--color-cyan)', fontSize: '0.85rem' }}>{editingDeviceId}</code>
              </h3>
              <button onClick={() => setEditingDeviceId(null)} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={18} /></button>
            </div>

            {!isAdmin && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: '600', marginBottom: '10px' }} className="badge-warning">
                <ShieldAlert size={16} />
                <span>Operator View — read only. Admin role required to modify.</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit}>
              <div className="edit-form-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '20px' }}>
                {[
                  { id: 'edit-device-name', label: 'Machine Asset Name', key: 'name', type: 'text', step: undefined },
                  { id: 'edit-device-location', label: 'Installation Location', key: 'location', type: 'text', step: undefined },
                  { id: 'edit-min-voltage', label: 'Undervoltage Limit (V)', key: 'minVoltage', type: 'number', step: '0.1' },
                  { id: 'edit-max-voltage', label: 'Overvoltage Limit (V)', key: 'maxVoltage', type: 'number', step: '0.1' },
                  { id: 'edit-max-current', label: 'Max Current Limit (A)', key: 'maxCurrent', type: 'number', step: '0.1' },
                  { id: 'edit-max-power', label: 'Max Power Limit (W)', key: 'maxPower', type: 'number', step: '1' },
                  { id: 'edit-min-pf', label: 'Min Power Factor', key: 'minPF', type: 'number', step: '0.01' },
                  { id: 'edit-max-energy', label: 'Max Cumulative Energy (kWh)', key: 'maxEnergy', type: 'number', step: '1' },
                ].map(field => (
                  <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{field.label}</label>
                    <input
                      id={field.id}
                      type={field.type}
                      step={field.step}
                      className="form-input"
                      value={editForm[field.key]}
                      onChange={(e) => setEditForm({ ...editForm, [field.key]: field.type === 'number' ? (field.step === '1' ? parseInt(e.target.value) : parseFloat(e.target.value)) : e.target.value })}
                      disabled={!isAdmin}
                      required
                    />
                  </div>
                ))}
              </div>

              {isAdmin && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn btn-outline" onClick={() => setEditingDeviceId(null)}>Cancel</button>
                  <button type="submit" className="btn btn-cyan" id="save-thresholds-btn">Commit Configuration</button>
                </div>
              )}
            </form>
          </section>
        )}

      </main>
    </div>
  );
}
