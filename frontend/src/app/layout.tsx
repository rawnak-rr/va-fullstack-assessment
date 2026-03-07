import type { ReactNode } from 'react';
import localFont from 'next/font/local';
import './globals.css';

const redHatMono = localFont({
  src: [
    {
      path: '../../public/fonts/red-hat-mono/red-hat-mono-latin-400-normal.woff2',
      weight: '400',
      style: 'normal'
    },
    {
      path: '../../public/fonts/red-hat-mono/red-hat-mono-latin-500-normal.woff2',
      weight: '500',
      style: 'normal'
    },
    {
      path: '../../public/fonts/red-hat-mono/red-hat-mono-latin-700-normal.woff2',
      weight: '700',
      style: 'normal'
    }
  ],
  display: 'swap'
});

export const metadata = {
  title: 'Vehicle Analytics – Telemetry Dashboard',
  description: 'Frontend assessment for the Vehicle Analytics technical assessment'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={redHatMono.className}>{children}</body>
    </html>
  );
}
