import createMDX from '@next/mdx';

const withMDX = createMDX();
const DEFAULT_DEV_ORIGIN = 'untarnished-berserkly-everette.ngrok-free.dev';

const normalizeDevOrigin = (value) => {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return null;
  }
};

const allowedDevOrigins = Array.from(
  new Set(
    [
      DEFAULT_DEV_ORIGIN,
      process.env.NGROK_DOMAIN,
      process.env.MVP_DEV_NGROK_DOMAIN,
      process.env.MVP_DEV_NGROK_URL,
    ]
      .map(normalizeDevOrigin)
      .filter(Boolean),
  ),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins,
  pageExtensions: ['js', 'jsx', 'md', 'mdx', 'ts', 'tsx'],
  transpilePackages: ['date-fns'],
  experimental: {
    optimizePackageImports: ['date-fns'],
  },
  async redirects() {
    return [
      {
        source: '/events',
        destination: '/discover',
        permanent: false,
      },
    ];
  },
};

export default withMDX(nextConfig);
