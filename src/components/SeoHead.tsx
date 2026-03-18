import Head from "next/head";
import {
  getBaseUrl,
  getRobotsContent,
  getDefaultImageUrl,
  buildParkingImageUrl,
} from "~/utils/seo";

export interface SeoHeadProps {
  title: string;
  description: string;
  /** Relative path or full URL for the page */
  url?: string;
  /** Parking image for og:image, or null to use default */
  image?: string | null;
}

export default function SeoHead({
  title,
  description,
  url,
  image,
}: SeoHeadProps) {
  const baseUrl = getBaseUrl();
  const fullUrl = url
    ? `${baseUrl.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
    : baseUrl;
  const imageUrl = image
    ? image.includes("http")
      ? image
      : buildParkingImageUrl(image) ?? getDefaultImageUrl()
    : getDefaultImageUrl();
  const robotsContent = getRobotsContent();

  return (
    <Head>
      <title key="title">{title}</title>
      <meta name="title" content={title} key="meta-title" />
      <meta name="description" content={description} key="meta-description" />
      <meta name="robots" content={robotsContent} key="meta-robots" />
      <link rel="canonical" href={fullUrl} key="canonical" />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" key="og-type" />
      <meta property="og:url" content={fullUrl} key="og-url" />
      <meta property="og:title" content={title} key="og-title" />
      <meta property="og:description" content={description} key="og-description" />
      <meta property="og:image" content={imageUrl} key="og-image" />
      <meta property="og:site_name" content="VeiligStallen" key="og-site_name" />

      {/* X (Twitter) */}
      <meta property="twitter:card" content="summary_large_image" key="twitter-card" />
      <meta property="twitter:url" content={fullUrl} key="twitter-url" />
      <meta property="twitter:title" content={title} key="twitter-title" />
      <meta property="twitter:description" content={description} key="twitter-description" />
      <meta property="twitter:image" content={imageUrl} key="twitter-image" />
    </Head>
  );
}
