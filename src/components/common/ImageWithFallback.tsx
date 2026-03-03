import { useState } from 'react';
import Image from 'next/image';

const ImageWithFallback = ({ src, fallbackSrc, alt = '', ...props }: { src: string, fallbackSrc: string, alt?: string, [key: string]: any }) => {
  const [imgSrc, setImgSrc] = useState(src);
  const isLocalUpload = src.includes('[local]');

  // For local uploads, use regular img tag to avoid Next.js optimization issues
  if (isLocalUpload) {
    const localSrc = src.replace('[local]', '/api');
    return (
      <img
        {...props}
        src={localSrc}
        alt={alt}
        onError={() => {
          // Fallback to the fallback image if local image fails
          const imgElement = document.querySelector(`img[src="${localSrc}"]`) as HTMLImageElement;
          if (imgElement) {
            imgElement.src = fallbackSrc;
          }
        }}
      />
    );
  }

  return (
    <Image
      {...props}
      src={imgSrc}
      onError={() => {
        setImgSrc(fallbackSrc);
      }}
      alt={alt}
    />
  );
};

export default ImageWithFallback;