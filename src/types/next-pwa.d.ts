import type { NextConfig } from 'next';

declare module 'next-pwa' {
  const withPWA: (config: {
    dest?: string;
    disable?: boolean;
  }) => (nextConfig: NextConfig) => NextConfig;
  
  export default withPWA;
} 