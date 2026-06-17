import './globals.css';

export const metadata = {
  title: 'VoltGuard - Industrial Electrical Fault Monitoring & Protection System',
  description: 'Real-time telemetry, active protection threshold management, historical alarm dispatching, and dynamic mechatronic node logging for industrial machinery.',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0a0f1e',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
