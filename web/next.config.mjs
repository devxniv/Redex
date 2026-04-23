/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "randomuser.me",
        port: "",
        pathname: "/api/portraits/**",
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb", // Adjust this (e.g., '2mb', '5mb') as needed
    },
  },
};

export default nextConfig;
