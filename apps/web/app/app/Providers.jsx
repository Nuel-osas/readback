'use client';
import '@rainbow-me/rainbowkit/styles.css';
import { RainbowKitProvider, getDefaultConfig, darkTheme } from '@rainbow-me/rainbowkit';
import { WagmiProvider } from 'wagmi';
import { base, baseSepolia } from 'wagmi/chains';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

const config = getDefaultConfig({
  appName: 'Readback',
  projectId: process.env.NEXT_PUBLIC_WC_PROJECT_ID || 'readback_voice_signing',
  chains: [base, baseSepolia],
  ssr: true,
});

export default function Providers({ children }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={qc}>
        <RainbowKitProvider theme={darkTheme({ accentColor: '#eef0f3', accentColorForeground: '#07080a', borderRadius: 'medium', overlayBlur: 'small' })}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
