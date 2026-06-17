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
  HelpCircle,
  ShieldAlert
} from 'lucide-react';

export default function DevicesPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Editing state
  const [editingDeviceId, setEditingDeviceId] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    location: '',
    minVoltage: 195.0,
    maxVoltage: 253.0,
    maxCurrent: 15.0,
    maxPower: 3300,
    minPF: 0.80,
    maxEnergy: 10000,
  });

  // Adding state
  const [isAdding, setIsAdding] = useState(false);
  const [addForm, setAddForm] = useState({
    id: '',
    name: '',
    location: '',
  });

  // 1. Session check
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

  // 2. Fetch all devices
  async function fetchDevices() {
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
      } else {
        setErrorMsg('Failed to load device catalog.');
      }
    } catch (err) {
      setErrorMsg('Network error while querying database.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      fetchDevices();
    }
  }, [user]);

  // 3. Trigger Edit Form
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
    setErrorMsg('');
    setSuccessMsg('');
  };

  // 4. Save updates
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (user.role !== 'ADMIN') {
      setErrorMsg('Unauthorized: Only administrators can modify thresholds.');
      return;
    }

    try {
      const res = await fetch(`/api/devices/${editingDeviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name,
          location: editForm.location,
          thresholds: {
            minVoltage: editForm.minVoltage,
            maxVoltage: editForm.maxVoltage,
            maxCurrent: editForm.maxCurrent,
            maxPower: editForm.maxPower,
            minPF: editForm.minPF,
            maxEnergy: editForm.maxEnergy,
          }
        }),
      });

      if (res.ok) {
        setSuccessMsg('Configurations written successfully!');
        setEditingDeviceId(null);
        fetchDevices();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to update thresholds.');
      }
    } catch (err) {
      setErrorMsg('Database save command failed.');
    }
  };

  // 5. Register device
  const handleAddDevice = async (e) => {
    e.preventDefault();
    if (user.role !== 'ADMIN') {
      setErrorMsg('Admins only.');
      return;
    }

    if (!addForm.id || !addForm.name || !addForm.location) {
      setErrorMsg('All fields are required.');
      return;
    }

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(addForm),
      });

      if (res.ok) {
        setSuccessMsg('New node provisioned successfully!');
        setIsAdding(false);
        setAddForm({ id: '', name: '', location: '' });
        fetchDevices();
      } else {
        const data = await res.json();
        setErrorMsg(data.error || 'Failed to register node.');
      }
    } catch (err) {
      setErrorMsg('API command failed.');
    }
  };

  // 6. Delete Device
  const handleDeleteDevice = async (id) => {
    if (user.role !== 'ADMIN') return;
    if (!confirm(`Are you sure you want to remove device "${id}"? This will purge all associated telemetry logs.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSuccessMsg('Device purged from registry.');
        fetchDevices();
      } else {
        setErrorMsg('Failed to delete device.');
      }
    } catch (err) {
      setErrorMsg('Network error.');
    }
  };

  if (!user) return null;

  const isAdmin = user.role === 'ADMIN';

  return (
    <div style={pageContainerStyle}>
      <Header user={user} />

      <main style={mainContentStyle}>
        <div style={pageHeaderStyle}>
          <div>
            <h1 style={pageTitleStyle}>Machine Nodes Registry</h1>
            <p style={pageSubtitleStyle}>Define electrical overload and voltage thresholds per mechatronic asset.</p>
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

        {/* FEEDBACK LABELS */}
        {errorMsg && (
          <div style={alertContainerStyle} className="badge-fault" id="devices-error-alert">
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div style={alertContainerStyle} className="badge-online" id="devices-success-alert">
            <Check size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* PROVISION NEW NODE CONTAINER */}
        {isAdding && (
          <section style={formCardStyle} className="glass-panel glow-cyan">
            <div style={formHeaderStyle}>
              <h3 style={formTitleStyle}>Register Machine Node</h3>
              <button onClick={() => setIsAdding(false)} style={closeBtnStyle}><X size={18} /></button>
            </div>
            <form onSubmit={handleAddDevice} style={formGridStyle}>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Device ID (Must be unique)</label>
                <input
                  id="new-device-id"
                  type="text"
                  className="form-input"
                  placeholder="e.g. DEV_VOLTGUARD_002"
                  value={addForm.id}
                  onChange={(e) => setAddForm({ ...addForm, id: e.target.value.toUpperCase() })}
                  required
                />
              </div>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Asset Name</label>
                <input
                  id="new-device-name"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Ventilation Fan B"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                  required
                />
              </div>
              <div style={inputGroupStyle}>
                <label style={labelStyle}>Installation Location</label>
                <input
                  id="new-device-location"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Warehouse Sector 4"
                  value={addForm.location}
                  onChange={(e) => setAddForm({ ...addForm, location: e.target.value })}
                  required
                />
              </div>
              <div style={formActionsStyle}>
                <button type="submit" className="btn btn-cyan" id="save-new-device-btn">Save Registry</button>
              </div>
            </form>
          </section>
        )}

        {/* DEVICE REGISTRY CATALOG LIST */}
        <section className="glass-panel" style={{ overflow: 'hidden' }}>
          <div className="custom-table-container">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Device Info</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Limits Summary (V / I / P)</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {devices.length === 0 ? (
                  <tr>
                    <td colSpan="5" style={emptyRowStyle}>No machines registered in database registry.</td>
                  </tr>
                ) : (
                  devices.map((device) => {
                    const isEditing = editingDeviceId === device.id;
                    const th = device.threshold;
                    
                    return (
                      <tr key={device.id} id={`device-row-${device.id}`}>
                        <td>
                          <div style={deviceMetaStyle}>
                            <strong>{device.name}</strong>
                            <span className="mono-num" style={idBadgeStyle}>{device.id}</span>
                          </div>
                        </td>
                        <td>{device.location}</td>
                        <td>
                          <span className={`badge badge-${device.status.toLowerCase()}`}>
                            {device.status}
                          </span>
                        </td>
                        <td>
                          {th ? (
                            <span style={thresholdSummaryStyle} className="mono-num">
                              {th.minVoltage}-{th.maxVoltage}V | {th.maxCurrent}A | {th.maxPower}W
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>Default Fallbacks</span>
                          )}
                        </td>
                        <td>
                          <div style={actionsGroupStyle}>
                            {!isAdmin && (
                              <button 
                                onClick={() => startEditing(device)}
                                style={actionIconBtnStyle}
                                title="View thresholds"
                              >
                                <Settings2 size={16} />
                              </button>
                            )}
                            {isAdmin && !isEditing && (
                              <>
                                <button
                                  id={`edit-thresholds-${device.id}`}
                                  onClick={() => startEditing(device)}
                                  className="btn btn-outline"
                                  style={actionBtnStyle}
                                >
                                  <Settings2 size={14} />
                                  <span>Configure</span>
                                </button>
                                <button
                                  id={`delete-device-${device.id}`}
                                  onClick={() => handleDeleteDevice(device.id)}
                                  className="btn btn-outline"
                                  style={{ ...actionBtnStyle, borderColor: 'var(--color-red-glow)', color: 'var(--color-red)' }}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* THRESHOLD EDITING CONFIGURATION DRAWER */}
        {editingDeviceId && (
          <section style={formCardStyle} className="glass-panel glow-cyan" id="thresholds-edit-panel">
            <div style={formHeaderStyle}>
              <h3 style={formTitleStyle}>
                Configure Thresholds: <code style={{ color: 'var(--color-cyan)' }}>{editingDeviceId}</code>
              </h3>
              <button onClick={() => setEditingDeviceId(null)} style={closeBtnStyle}><X size={18} /></button>
            </div>
            
            {!isAdmin && (
              <div style={readOnlyWarningStyle} className="badge-warning">
                <ShieldAlert size={16} />
                <span>Operator View (Read-Only: Modifying requires Supervisor role).</span>
              </div>
            )}

            <form onSubmit={handleSaveEdit}>
              <div style={editFormGridStyle}>
                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Machine Asset Name</label>
                  <input
                    id="edit-device-name"
                    type="text"
                    className="form-input"
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    disabled={!isAdmin}
                    required
                  />
                </div>
                
                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Installation Location</label>
                  <input
                    id="edit-device-location"
                    type="text"
                    className="form-input"
                    value={editForm.location}
                    onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Undervoltage Limit (V)</label>
                  <input
                    id="edit-min-voltage"
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={editForm.minVoltage}
                    onChange={(e) => setEditForm({ ...editForm, minVoltage: parseFloat(e.target.value) })}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Overvoltage Limit (V)</label>
                  <input
                    id="edit-max-voltage"
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={editForm.maxVoltage}
                    onChange={(e) => setEditForm({ ...editForm, maxVoltage: parseFloat(e.target.value) })}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Max Current Limit (A)</label>
                  <input
                    id="edit-max-current"
                    type="number"
                    step="0.1"
                    className="form-input"
                    value={editForm.maxCurrent}
                    onChange={(e) => setEditForm({ ...editForm, maxCurrent: parseFloat(e.target.value) })}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Max Power Limit (W)</label>
                  <input
                    id="edit-max-power"
                    type="number"
                    className="form-input"
                    value={editForm.maxPower}
                    onChange={(e) => setEditForm({ ...editForm, maxPower: parseInt(e.target.value) })}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Min Power Factor</label>
                  <input
                    id="edit-min-pf"
                    type="number"
                    step="0.01"
                    className="form-input"
                    value={editForm.minPF}
                    onChange={(e) => setEditForm({ ...editForm, minPF: parseFloat(e.target.value) })}
                    disabled={!isAdmin}
                    required
                  />
                </div>

                <div style={inputGroupStyle}>
                  <label style={labelStyle}>Max Cumulative Energy (kWh)</label>
                  <input
                    id="edit-max-energy"
                    type="number"
                    step="1"
                    className="form-input"
                    value={editForm.maxEnergy}
                    onChange={(e) => setEditForm({ ...editForm, maxEnergy: parseInt(e.target.value) })}
                    disabled={!isAdmin}
                    required
                  />
                </div>
              </div>

              {isAdmin && (
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button 
                    type="button" 
                    className="btn btn-outline" 
                    onClick={() => setEditingDeviceId(null)}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="btn btn-cyan"
                    id="save-thresholds-btn"
                  >
                    Commit Configuration
                  </button>
                </div>
              )}
            </form>
          </section>
        )}
      </main>
    </div>
  );
}

// Inline Styles for Devices Page
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

const alertContainerStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '12px 18px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.9rem',
  fontWeight: '500',
};

const formCardStyle = {
  padding: '24px',
  borderRadius: 'var(--radius-md)',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const formHeaderStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  borderBottom: '1px solid var(--border-muted)',
  paddingBottom: '12px',
};

const formTitleStyle = {
  fontSize: '1rem',
  fontWeight: '600',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const closeBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const formGridStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr 1fr auto',
  gap: '16px',
  alignItems: 'flex-end',
};

const editFormGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
  gap: '20px',
};

const inputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const labelStyle = {
  fontSize: '0.75rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const formActionsStyle = {
  display: 'flex',
  alignItems: 'center',
  height: '100%',
};

const deviceMetaStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
};

const idBadgeStyle = {
  fontSize: '0.7rem',
  color: 'var(--color-cyan)',
  fontWeight: '600',
};

const thresholdSummaryStyle = {
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
};

const emptyRowStyle = {
  textAlign: 'center',
  color: 'var(--text-muted)',
  padding: '40px 16px',
};

const actionsGroupStyle = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
};

const actionBtnStyle = {
  padding: '6px 12px',
  fontSize: '0.8rem',
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
};

const actionIconBtnStyle = {
  background: 'transparent',
  border: '1px solid var(--border-muted)',
  borderRadius: 'var(--radius-sm)',
  padding: '6px',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
};

const readOnlyWarningStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 14px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.8rem',
  fontWeight: '600',
  marginBottom: '10px',
};
