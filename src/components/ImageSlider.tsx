// @ts-nocheck

import React, { useState } from 'react';
import Image from 'next/image';
import { useKeenSlider } from "keen-slider/react";
import "keen-slider/keen-slider.min.css";

const ImageSlider = ({
  images,
  baseUrl = "https://static.veiligstallen.nl/library/fietsenstallingen/"
}: {
  images: Array<string>
  baseUrl?: string
}) => {
  // const [ref] = useKeenSlider<HTMLDivElement>({
  //   slides: {
  //     perView: 3,
  //     spacing: 15,
  //   },
  // });

  if(!images) {
    return <></>;
  }

  const fixurl = (imgUrl) => {
    let newurl;
    if(imgUrl.includes('http')) {
      newurl = imgUrl;
    } else if (imgUrl.includes('[local]')) {
      // For local uploads, serve via API route
      // Replace [local] with /api to use the API route
      newurl = imgUrl.replace('[local]', '/api');
    } else {
      newurl = `${baseUrl}${imgUrl}`
    }
    // console.log('got newurl', newurl);
    return newurl;
  }

  return (
    <div className="card-list">
      {/*<div ref={ref} className="card-list__slides keen-slider">*/}
      <div className="card-list__slides keen-slider">
        {images.map((imgUrl, idx) => { 
            const url = fixurl(imgUrl);
            const isLocalUpload = imgUrl.includes('[local]');
            
            if (isLocalUpload) {
              // Use regular img tag for local uploads to avoid Next.js optimization issues
              return (
                <img
                  key={'img-'+idx}
                  src={url}
                  alt={"Image " + idx}
                  width={203}
                  height={133}
                  className="keen-slider__slide mr-3 rounded-lg"
                  style={{ objectFit: 'cover' }}
                />
              );
            }
            
            // Use Next.js Image component for external images
            return (
              <Image
                key={'img-'+idx}
                src={url}
                alt={"Image " + idx}
                width={203}
                height={133}
                className="keen-slider__slide mr-3 rounded-lg"
                />
                ) 
            }
          )}
      </div>
    </div>
  );
};

export default ImageSlider;
