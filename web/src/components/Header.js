'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Shield, LayoutDashboard, Cpu, AlertTriangle, LogOut, User as UserIcon } from 'lucide-react';

export default function Header({ user }) {
  const router = useRouter();
  const pathname = usePathname();

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.replace('/login');
      }
    } catch (err) {
      console.error('Logout error', err);
    }
  };

  const navItems = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Devices', href: '/devices', icon: Cpu },
    { name: 'Alarms Log', href: '/alarms', icon: AlertTriangle },
  ];

  return (
    <header style={headerStyle} className="glass-panel" id="main-header">
      <div style={brandStyle}>
        <div style={logoWrapperStyle} className="pulse-active-cyan">
          <Shield size={22} color="var(--color-cyan)" />
        </div>
        <div style={logoTextStyle}>
          <span style={logoMainStyle}>VOLTGUARD</span>
          <span style={logoSubStyle}>INDUSTRIAL MONITOR</span>
        </div>
      </div>

      <nav style={navStyle}>
        {navItems.map((item) => {
          const IconComponent = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link key={item.name} href={item.href} style={isActive ? activeNavLinkStyle : navLinkStyle}>
              <IconComponent size={18} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>

      <div style={userControlStyle}>
        <div style={userInfoStyle}>
          <UserIcon size={16} color="var(--text-secondary)" />
          <div style={userDetailsStyle}>
            <span style={usernameStyle}>{user?.username || 'Operator'}</span>
            <span style={roleStyle}>{user?.role || 'OPERATOR'}</span>
          </div>
        </div>
        <button
          id="logout-button"
          onClick={handleLogout}
          className="btn btn-outline"
          style={{ padding: '8px 14px', fontSize: '0.85rem' }}
          title="Sign out of system portal"
        >
          <LogOut size={16} />
          <span>Logout</span>
        </button>
      </div>
    </header>
  );
}

// Inline Styles for Navigation Header
const headerStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 32px',
  borderRadius: '0px 0px var(--radius-md) var(--radius-md)',
  borderTop: 'none',
  borderLeft: 'none',
  borderRight: 'none',
  marginBottom: '30px',
  width: '100%',
};

const brandStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const logoWrapperStyle = {
  width: '38px',
  height: '38px',
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'var(--color-cyan-glow)',
  border: '1px solid hsla(186, 100%, 48%, 0.2)',
};

const logoTextStyle = {
  display: 'flex',
  flexDirection: 'column',
};

const logoMainStyle = {
  fontFamily: 'var(--font-sans)',
  fontSize: '1.25rem',
  fontWeight: '700',
  letterSpacing: '0.1em',
  lineHeight: '1.1',
};

const logoSubStyle = {
  fontSize: '0.65rem',
  fontWeight: '500',
  letterSpacing: '0.05em',
  color: 'var(--text-muted)',
};

const navStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const navLinkStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 16px',
  borderRadius: 'var(--radius-sm)',
  fontSize: '0.9rem',
  color: 'var(--text-secondary)',
  fontWeight: '500',
  transition: 'all var(--transition-fast)',
};

const activeNavLinkStyle = {
  ...navLinkStyle,
  color: 'var(--color-cyan)',
  background: 'var(--color-cyan-glow)',
  border: '1px solid hsla(186, 100%, 48%, 0.15)',
};

const userControlStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '20px',
};

const userInfoStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  borderRight: '1px solid var(--border-muted)',
  paddingRight: '20px',
};

const userDetailsStyle = {
  display: 'flex',
  flexDirection: 'column',
  textAlign: 'right',
};

const usernameStyle = {
  fontSize: '0.85rem',
  fontWeight: '600',
};

const roleStyle = {
  fontSize: '0.7rem',
  color: 'var(--color-cyan)',
  fontFamily: 'var(--font-mono)',
  fontWeight: '600',
  textTransform: 'uppercase',
};
