import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const sans = Inter({ subsets: ['latin'], variable: '--sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--mono' });

export const metadata = {
  title: 'Readback: say what you think you are signing',
  description: 'A voice agent that listens to what you think you are signing, decodes what the transaction really does, and stops it when they do not match.',
  openGraph: { title: 'Readback', description: 'Say what you think you are signing.' },
  icons: { icon: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Crect width='24' height='24' rx='6' fill='%23141414'/%3E%3Cpath d='M5 12h2M8 9v6M11 6v12M14 9v6M17 11v2' stroke='%23f4f1ea' stroke-width='1.8' stroke-linecap='round'/%3E%3C/svg%3E" },
};
export const viewport = { themeColor: '#f4f1ea' };

export default function RootLayout({ children }) {
  return <html lang="en" className={`${sans.variable} ${mono.variable}`}><body>{children}</body></html>;
}
