/** @type {import('next').NextConfig} */
const nextConfig = {
    transpilePackages: ['date-fns'],
    experimental: {
        optimizePackageImports: ['date-fns'],
    },
};

export default nextConfig;
