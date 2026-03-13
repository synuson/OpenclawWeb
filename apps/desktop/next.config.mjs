/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    externalDir: true,
    typedRoutes: false
  }
};

export default nextConfig;
