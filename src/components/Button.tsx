// @ts-nocheck
import { type MouseEvent } from 'react';
import Styles from './Button.module.css';

export const Button = ({
  onClick,
  children,
  htmlBefore,
  className,
  style,
  variant
}: {
  onClick?: Function,
  children: any
  htmlBefore?: any,
  className?: string,
  style?: object
  variant?: string
}) => {
  return (
    <button
      className={`
        py-1 px-4 mb-3
        text-left rounded-full
        whitespace-nowrap text-ellipsis overflow-hidden
        font-poppinsmedium
        width-auto
        text-base
        hover:shadow
        transition-all
        text-white
        ${className}
        ${Styles[variant]}
      `}
      onClick={(e: MouseEvent<HTMLButtonElement, MouseEvent>) => {
        if (onClick) onClick(e)
      }}
      style={Object.assign({}, {
        userSelect: "none", // disable highlighting
        backgroundColor: '#CC0000'
      }, style)}
    >
      {htmlBefore}
      {children}
    </button>
  );
}

export const RadioButton = ({
  isActive,
  onClick,
  children,
  htmlBefore,
  className
}: {
  isActive?: boolean,
  onClick?: Function,
  children: any
  htmlBefore?: any
  className?: string
}) => {
  return (
    <button
      className={`
        px-2 mb-3
        text-left rounded-md
        whitespace-nowrap text-ellipsis overflow-hidden
        font-poppinsmedium
        width-auto
        text-base
        hover:shadow
        transition-all
        bg-white
        ${className && className.indexOf('py-') > -1 ? '' : 'py-1'}
        ${isActive
          ? "border border-gray-700 shadow shadow-md"
          : "border border-gray-200 bg-white text-gray-700 shadow shadow-sm"
        }
        ${className}
      `}
      onClick={(e) => {
        if (onClick) onClick(e)
      }}
      style={{ userSelect: "none" }} // disable highlighting
    >
      {htmlBefore}
      {children}
    </button>
  );
}

export const IconButton = ({
  onClick,
  children,
  htmlBefore,
  className,
  iconUrl,
  style
}: {
  onClick?: Function,
  children?: any
  htmlBefore?: any,
  className?: string
  iconUrl?: string
  style?: any
}) => {
  return (
    <button
      className={`
        text-left rounded-full
        whitespace-nowrap text-ellipsis overflow-hidden
        font-poppinsmedium
        width-auto
        text-base
        hover:shadow
        transition-all
        text-white
        bg-center
        bg-no-repeat
        w-12
        h-12
        shadow-md
        ${className}
      `}
      onClick={(e) => {
        if (onClick) onClick(e)
      }}
      style={Object.assign({}, {
        userSelect: "none", // disable highlighting
        backgroundColor: '#FFFFFF',
        backgroundImage: `url('${iconUrl}')`,
        backgroundSize: '20px'
      }, style)}
    >
      {htmlBefore}
      {children}
    </button>
  );
}
