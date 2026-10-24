import type { NextConfig } from 'next';

// The game API lives in the NestJS service (backend/). The browser keeps talking to
// the Next origin, so cookies stay first-party and no CORS setup is needed.
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  devIndicators: false,
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` }];
  }
};

export default nextConfig;
