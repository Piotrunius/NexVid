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
            "default-src 'self' blob: https:",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https:",
            "style-src 'self' 'unsafe-inline' https:",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data: https:",
            `connect-src 'self' blob: ${connectSrc.filter(s => s !== "'self'").join(' ')}`,
            "media-src 'self' blob: data: https:",
            "worker-src 'self' blob: https:",
            "child-src 'self' blob:",
            "frame-src 'self' https://vidlink.pro https://*.vidlink.pro https://vidsrc.icu https://*.vidsrc.icu https://vidsrc.me https://*.vidsrc.me https://vidsrc.cc https://*.vidsrc.cc https://vidsrc.to https://*.vidsrc.to https://www.youtube.com https:",
            "frame-ancestors 'none'",
        ].join('; '),
    },
    {
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
    },
    {
        key: 'X-Frame-Options',
        value: 'DENY',
    },
    {
        key: 'X-Content-Type-Options',
        value: 'nosniff',
    },
    {
        key: 'Referrer-Policy',
        value: 'origin-when-cross-origin',
    },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=()',
    },
];

const nextConfig = {
    eslint: {
        ignoreDuringBuilds: true,
    },
    typescript: {
        ignoreBuildErrors: true,
    },
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

const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    cacheOnFrontEndNav: true,
    aggressiveFrontEndNavCaching: false,
    reloadOnOnline: true,
    swcMinify: true,
    disable: false,
    workboxOptions: {
        disableDevLogs: true,
    },
});

module.exports = withPWA(nextConfig);
