/** @type {import('next').NextConfig} */
export default {
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, '@x402/evm': false, '@coinbase/cdp-sdk': false };
    config.externals.push('pino-pretty', 'lokijs', 'encoding');
    return config;
  },
};
