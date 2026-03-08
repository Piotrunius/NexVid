/** @type {import('next').NextConfig} */
const securityHeaders = [
    {
        key: 'Content-Security-Policy',
        value: [
            "default-src 'self' https:",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
            "style-src 'self' 'unsafe-inline' https:",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data: https:",
            "connect-src 'self' https: wss:",
            "media-src 'self' blob: data: https:",
            "worker-src 'self' blob:",
            "child-src 'self' blob:",
            "frame-src 'self' https:",
        ].join('; '),
    },
];

const nextConfig = {
    images: {
        remotePatterns: [
            { protocol: 'https', hostname: 'image.tmdb.org' },
            { protocol: 'https', hostname: 'i.imgur.com' },
        ],
    },
    async headers() {
        return [
            {
                source: '/(.*)',
                headers: securityHeaders,
            },
        ];
    },
    async rewrites() {
        return [
            {
                source: '/api/tmdb/:path*',
                destination: 'https://api.themoviedb.org/3/:path*',
            },
        ];
    },
};

module.exports = nextConfig;
