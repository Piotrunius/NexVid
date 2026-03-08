/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== 'production';
const connectSrc = ["'self'", 'https:', 'wss:'];
if (isDev) {
    connectSrc.push('http://localhost:3001', 'http://127.0.0.1:3001');
}

const securityHeaders = [
    {
        key: 'Content-Security-Policy',
        value: [
            "default-src 'self' https:",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
            "style-src 'self' 'unsafe-inline' https:",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data: https:",
            `connect-src ${connectSrc.join(' ')}`,
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
