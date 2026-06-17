'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            router.replace('/dashboard');
            return;
          }
        }
        router.replace('/login');
      } catch (err) {
        console.error('Session verification failed, routing to login.', err);
        router.replace('/login');
      }
    }
    checkAuth();
  }, [router]);

  return (
    <div style={containerStyle} id="root-loader-screen">
      <div style={spinnerContainerStyle} className="glass-panel glow-cyan">
        <div style={spinnerStyle} className="pulse-active-cyan"></div>
        <h2 style={titleStyle}>VOLTGUARD</h2>
        <p style={subtitleStyle}>Initializing secure industrial portal...</p>
      </div>
    </div>
  );
}

// Inline styles for the startup loading page
const containerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: '100vh',
  backgroundColor: 'var(--bg-main)',
  padding: '20px',
};

const spinnerContainerStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '40px 60px',
  borderRadius: 'var(--radius-lg)',
  maxWidth: '400px',
  width: '100%',
  textAlign: 'center',
};

const spinnerStyle = {
  width: '50px',
  height: '50px',
  borderRadius: '50%',
  border: '3px solid var(--color-cyan)',
  borderTopColor: 'transparent',
  marginBottom: '24px',
};

const titleStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: '1.8rem',
  fontWeight: '700',
  letterSpacing: '0.1em',
  color: 'var(--text-primary)',
  marginBottom: '8px',
};

const subtitleStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
};
