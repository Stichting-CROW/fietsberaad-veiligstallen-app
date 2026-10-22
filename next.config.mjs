import withPWA from "next-pwa";

/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation.
 * This is especially useful for Docker builds.
 */
!process.env.SKIP_ENV_VALIDATION && (await import("./src/env.mjs"));

/** @type {import("next").NextConfig} */
const config = {
  reactStrictMode: true,

  /** MUI modularizeImports reduces bundle by importing only used components */
  modularizeImports: {
    "@mui/material": {
      transform: "@mui/material/{{member}}",
    },
  },

  /** Cache static assets for 1 year (immutable) */
  async headers() {
    return [
      {
        source: "/images/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/icons/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/font/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
      {
        source: "/api-docs/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
        ],
      },
    ];
  },

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

  /** Use polling instead of native file watchers to avoid EMFILE on Linux */
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        poll: 1000,
        aggregateTimeout: 300,
      };
    }
    return config;
  },
  async rewrites() {
    const presentatieHosts = [
      "presentaties.veiligstallen.nl",
      "presentaties.fiets-en-win.nl",
      "presentaties.fietsenwin.nl",
    ];
    const verwijssysteemHosts = [
      "verwijssysteem.veiligstallen.nl",
      "verwijssysteem.fiets-en-win.nl",
      "verwijssysteem.fietsenwin.nl",
    ];
    const overzichtenHosts = [
      "overzichten.veiligstallen.nl",
      "overzichten.fiets-en-win.nl",
      "overzichten.fietsenwin.nl",
    ];

    /** @param {string[]} hosts @param {{ source: string, destination: string }[]} rules */
    const byHost = (hosts, rules) =>
      hosts.flatMap((host) =>
        rules.map((rule) => ({
          ...rule,
          has: [{ type: "host", value: host }],
        }))
      );

    const presentatieRules = [
      { source: "/", destination: "/api/display/presentaties/index" },
      { source: "/index.cfm", destination: "/api/display/presentaties/index" },
      { source: "/presentatie.cfm", destination: "/api/display/presentaties/presentatie" },
      { source: "/slide2.cfm", destination: "/api/display/presentaties/slide2" },
      { source: "/slide.cfm", destination: "/api/display/presentaties/slide2" },
    ];

    const verwijssysteemRules = [
      { source: "/remote/Webservice.cfc", destination: "/api/display/webservice" },
      { source: "/:path*", destination: "/api/display/verwijssysteem/:path*" },
    ];

    const overzichtenRules = [{ source: "/:path*", destination: "/api/display/overzichten/:path*" }];

    const devDisplay = [
      { source: "/presentatie.cfm", destination: "/api/display/presentaties/presentatie" },
      { source: "/slide2.cfm", destination: "/api/display/presentaties/slide2" },
      { source: "/slide.cfm", destination: "/api/display/presentaties/slide2" },
      { source: "/display/presentaties/index.cfm", destination: "/api/display/presentaties/index" },
      { source: "/display/presentaties/presentatie.cfm", destination: "/api/display/presentaties/presentatie" },
      { source: "/display/presentaties/slide2.cfm", destination: "/api/display/presentaties/slide2" },
      { source: "/display/verwijssysteem/:path*", destination: "/api/display/verwijssysteem/:path*" },
      { source: "/display/overzichten/:path*", destination: "/api/display/overzichten/:path*" },
    ];

    return [
      { source: "/library/:path*", destination: "/api/library/:path*" },
      { source: "/sitemap.xml", destination: "/api/sitemap.xml" },
      { source: "/veiligstallen.kml", destination: "/api/info-files/kml" },
      { source: "/veiligstallen.xml", destination: "/api/info-files/xml" },
      { source: "/robots.txt", destination: "/api/robots" },
      ...devDisplay,
      ...byHost(presentatieHosts, presentatieRules),
      ...byHost(verwijssysteemHosts, verwijssysteemRules),
      ...byHost(overzichtenHosts, overzichtenRules),
    ];
  },
};

const nextConfig = withPWA({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
})(config);

export default nextConfig;
