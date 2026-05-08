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
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "@radix-ui/react-select",
      "@radix-ui/react-dialog",
      // add other @radix-ui packages you use
    ],
  },
};

export default nextConfig;
