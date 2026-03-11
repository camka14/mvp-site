import createMDX from '@next/mdx';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const nextConfig = {
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
