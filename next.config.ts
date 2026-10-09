import type { NextConfig } from "next";

const baseSecurityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    // Revisiting a page within 30s is instant; server actions still invalidate via revalidatePath.
    staleTimes: { dynamic: 30 },
    // Catalog photos are uploaded through a server action.
    serverActions: { bodySizeLimit: "10mb" },
  },
  images: {
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      // Marketplace thumbnails used as a fallback when a catalog item has no panel photo.
      { protocol: "https", hostname: "**.mlstatic.com" },
      { protocol: "https", hostname: "**.susercontent.com" },
    ],
  },
  async headers() {
    return [
      { source: "/:path*", headers: baseSecurityHeaders },
      // The internal panel holds sales data and state-changing actions; the public catalog stays embeddable.
      { source: "/((?!catalogo).*)", headers: [{ key: "X-Frame-Options", value: "SAMEORIGIN" }] },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
