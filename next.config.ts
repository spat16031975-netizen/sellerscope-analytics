import type { NextConfig } from "next";

const pagesBasePath = process.env.PAGES_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  allowedDevOrigins: ["127.0.0.1"],
  output: pagesBasePath ? "export" : undefined,
  basePath: pagesBasePath,
  trailingSlash: Boolean(pagesBasePath),
};

export default nextConfig;

