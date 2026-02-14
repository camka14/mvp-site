/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig;
