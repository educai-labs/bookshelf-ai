/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
      },
      {
        protocol: "https",
        hostname: "covers.openlibrary.org",
      },
      {
        protocol: "https",
        hostname: "books.google.com",
      },
      {
        protocol: "https",
        hostname: "*.googleusercontent.com",
      },
    ],
  },
  async rewrites() {
    // Proxy server-side de la API FastAPI (feature 013): el frontend llama
    // `/api/v1/*` relativo y Next.js lo reenvía al backend sin CORS ni URLs
    // hardcodeadas en componentes. `API_URL` se configura en producción.
    const apiUrl = process.env.API_URL || "http://localhost:8000";
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
