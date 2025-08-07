import { useState } from 'react';
import Image from 'next/image';

const ImageWithFallback = ({ src, fallbackSrc, ...props }: { src: string, fallbackSrc: string, [key: string]: any }, alt: string) => {
  const [imgSrc, setImgSrc] = useState(src);

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