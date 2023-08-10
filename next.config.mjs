/** @type {import('next').NextConfig} */
const nextConfig = {
    experimental: {
      // Enabling additional features may help with Tailwind compatibility
      optimizeCss: true,
    },
    typescript: {
      ignoreBuildErrors: true,
    },
    eslint: {
      ignoreDuringBuilds: true,
    },
  };
export default nextConfig;
 