/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Allow images from any source (logos are local)
    images: {
        unoptimized: true,
    },
};

module.exports = nextConfig;
