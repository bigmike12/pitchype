import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Pages from the site that used this domain before. Google still lists them
  // as sitelinks; permanent redirects send those visitors somewhere useful
  // and tell Google to replace the old links.
  async redirects() {
    return [
      { source: "/services", destination: "/for-business", permanent: true },
      { source: "/service", destination: "/for-business", permanent: true },
      {
        source: "/home-services",
        destination: "/for-business",
        permanent: true,
      },
      { source: "/contact-us", destination: "/contact", permanent: true },
      { source: "/contactus", destination: "/contact", permanent: true },
    ];
  },
  experimental: {
    serverActions: {
      // Profile photos are up to 5MB (plus form overhead) when the browser
      // can't shrink them first. Vercel itself stops request bodies at 4.5MB.
      bodySizeLimit: "6mb",
    },
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
