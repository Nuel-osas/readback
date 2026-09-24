/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  transpilePackages: ['@readback/core', '@readback/provider'],
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, '@x402/evm': false, '@coinbase/cdp-sdk': false, '@react-native-async-storage/async-storage': false };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};
