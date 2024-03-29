import * as React from "react";
// import Input from '@mui/material/TextField';

function PageTitle({
  children,
  className,
  style
}: {
  children?: any,
  className?: string,
  style?: string
}) {
  return (
    <h1 className={`
      text-lg
      sm:text-3xl
      font-poppinssemibold
      ${className && className.indexOf('mb-') > -1 ? '' : 'mb-6'}
      ${className}
    `}
    style={style}
    >
      {children}
    </h1>
  );
}

export default PageTitle;
