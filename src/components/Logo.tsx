// Logo.tsx - Location specific logo
import * as React from "react";

interface LogoProps {
  imageUrl?: string;
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ imageUrl, className }) => {
  return (
    <>
  		<img
        src={imageUrl ? imageUrl : `/images/logo-transparant.png`}
        className={`block mr-2 h-12  ${className}`}
        alt="logo Gemeente"
      />
    </>
  );
}

export default Logo;
