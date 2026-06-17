'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Lock, User as UserIcon } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('Please provide all credentials');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Authentication failed');
      } else {
        router.replace('/dashboard');
      }
    } catch (err) {
      setError('Network error. Check connection to VoltGuard database.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle} className="glass-panel glow-cyan">
        <div style={headerStyle}>
          <div style={logoWrapperStyle} className="pulse-active-cyan">
            <Shield size={32} color="var(--color-cyan)" />
          </div>
          <h1 style={titleStyle}>VOLTGUARD</h1>
          <p style={subtitleStyle}>Industrial Electrical Monitoring & Protection</p>
        </div>

        {error && (
          <div style={errorContainerStyle} className="badge-fault" id="login-error-alert">
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={formStyle}>
          <div style={inputGroupStyle}>
            <label htmlFor="username-input" style={labelStyle}>Operator Username</label>
            <div style={inputWrapperStyle}>
              <UserIcon size={18} style={iconStyle} />
              <input
                id="username-input"
                type="text"
                className="form-input"
                placeholder="Enter username (e.g. admin)"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={loading}
                required
                style={{ paddingLeft: '40px' }}
              />
            </div>
          </div>

          <div style={inputGroupStyle}>
            <label htmlFor="password-input" style={labelStyle}>Access Password</label>
            <div style={inputWrapperStyle}>
              <Lock size={18} style={iconStyle} />
              <input
                id="password-input"
                type="password"
                className="form-input"
                placeholder="Enter password (e.g. admin123)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
                style={{ paddingLeft: '40px' }}
              />
            </div>
          </div>

          <button
            id="login-submit-button"
            type="submit"
            className="btn btn-cyan"
            disabled={loading}
            style={{ width: '100%', marginTop: '10px' }}
          >
            {loading ? 'Authenticating Operator...' : 'Establish Secure Connection'}
          </button>
        </form>

        <div style={footerStyle}>
          <p>Initial default credentials: <code>admin</code> / <code>admin123</code></p>
          <p style={{ marginTop: '4px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            System Core Version: 1.0.0-devkitv1
          </p>
        </div>
      </div>
    </div>
  );
}

// Inline Styles for Login Portal
const containerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-main)',
  padding: '20px',
};

const cardStyle = {
  width: '100%',
  maxWidth: '420px',
  padding: '40px 30px',
  borderRadius: 'var(--radius-lg)',
  display: 'flex',
  flexDirection: 'column',
};

const headerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  marginBottom: '30px',
  textAlign: 'center',
};

const logoWrapperStyle = {
  width: '60px',
  height: '60px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--color-cyan-glow)',
  border: '1px solid hsla(186, 100%, 48%, 0.3)',
  marginBottom: '16px',
};

const titleStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: '2rem',
  fontWeight: '700',
  letterSpacing: '0.12em',
  color: 'var(--text-primary)',
};

const subtitleStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: '0.85rem',
  color: 'var(--text-secondary)',
  marginTop: '4px',
};

const errorContainerStyle = {
  padding: '12px',
  borderRadius: 'var(--radius-sm)',
  marginBottom: '20px',
  fontSize: '0.85rem',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: '500',
  textAlign: 'center',
};

const formStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
};

const inputGroupStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
};

const labelStyle = {
  fontSize: '0.8rem',
  fontWeight: '600',
  color: 'var(--text-secondary)',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
};

const inputWrapperStyle = {
  position: 'relative',
  display: 'flex',
  alignItems: 'center',
};

const iconStyle = {
  position: 'absolute',
  left: '14px',
  color: 'var(--text-muted)',
};

const footerStyle = {
  marginTop: '30px',
  textAlign: 'center',
  fontSize: '0.8rem',
  color: 'var(--text-secondary)',
};
