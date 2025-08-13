import withPWA from "next-pwa";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds.
 */
!process.env.SKIP_ENV_VALIDATION && (await import("./src/env.mjs"));

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  /**
   * If you have the "experimental: { appDir: true }" setting enabled, then you
   * must comment the below `i18n` config out.
   *
   * @see https://github.com/vercel/next.js/issues/41980
   */
  // i18n: {
  //   locales: ["en"],
  //   defaultLocale: "en",
  // },
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    domains: ["static.veiligstallen.nl", "fms.veiligstallen.nl", "localhost", "beta.veiligstallen.nl"],
    remotePatterns: [
      {
        protocol: "https",
        hostname: "places.ns-mlab.nl",
        port: "",
        pathname: "*/**",
      },
    ],
  },
  distDir: "build",
  output: "standalone",
};

const nextConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
})(config);

export default nextConfig;
