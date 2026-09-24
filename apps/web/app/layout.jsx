import { JetBrains_Mono } from 'next/font/google';
import './globals.css';

const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--mono' });

export const metadata = {
  metadataBase: new URL('https://readback.vercel.app'),
  title: 'Readback: say what you think you are signing',
  description: 'A voice-verified signing protocol. Readback hears what you think you are signing, decodes what the transaction really does, and a Safe guard refuses anything that does not match.',
  openGraph: { title: 'Readback', description: 'Say what you think you are signing.', images: ['/img/cockpit-1200.webp'] },
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%2307080a'/%3E%3Cpath d='M5 12c4 0 6 4 11 4s7-4 11-4' stroke='%23ffb547' stroke-width='2.2' fill='none' stroke-linecap='round'/%3E%3Cpath d='M5 20c4 0 6-4 11-4s7 4 11 4' stroke='%233ddc97' stroke-width='2.2' fill='none' stroke-linecap='round'/%3E%3C/svg%3E" },
};
export const viewport = { themeColor: '#07080a' };

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={mono.variable}>
      <head>
        {/* Fontshare's ITF licence requires serving from their CDN, not self-hosting. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=clash-display@500,600,700&f[]=satoshi@400,500,700&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
