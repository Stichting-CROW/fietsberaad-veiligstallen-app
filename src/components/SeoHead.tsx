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
      <title>{title}</title>
      <meta name="title" content={title} />
      <meta name="description" content={description} />
      <meta name="robots" content={robotsContent} />

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content={fullUrl} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:site_name" content="VeiligStallen" />

      {/* X (Twitter) */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content={fullUrl} />
      <meta property="twitter:title" content={title} />
      <meta property="twitter:description" content={description} />
      <meta property="twitter:image" content={imageUrl} />
    </Head>
  );
}
