/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/client",
      "prisma",
      "@aws-sdk/client-s3",
      "@aws-sdk/s3-request-presigner",
    ],
    outputFileTracingIncludes: {
      "/**": ["./node_modules/.prisma/client/**/*"],
    },
  },
};

export default nextConfig;
