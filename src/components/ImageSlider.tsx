import React, { useState } from 'react';
import Image from 'next/image';
import { useKeenSlider } from "keen-slider/react";
import "keen-slider/keen-slider.min.css";

const ImageSlider = () => {
  const [ref] = useKeenSlider<HTMLDivElement>({
    slides: {
      perView: 3,
      spacing: 15,
    },
  });

  return (
    <div className="card-list">
      <div ref={ref} className="card-list__slides keen-slider">
        <Image
          src="/image1.jpg"
          alt="Image 1"
          width={203}
          height={133}
          className="keen-slider__slide"
        />
        <Image
          src="/image1.jpg"
          alt="Image 1"
          width={203}
          height={133}
          className="keen-slider__slide"
        />
        <Image
          src="/image1.jpg"
          alt="Image 1"
          width={203}
          height={133}
          className="keen-slider__slide"
        />
        <Image
          src="/image1.jpg"
          alt="Image 1"
          width={203}
          height={133}
          className="keen-slider__slide"
        />
        <Image
          src="/image1.jpg"
          alt="Image 1"
          width={203}
          height={133}
          className="keen-slider__slide"
        />
      </div>
    </div>
  );
};

export default ImageSlider;