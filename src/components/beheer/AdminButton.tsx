import React, { type MouseEvent } from "react";

interface AdminButtonProps {
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  href?: string;
  target?: string;
  title?: string;
}

const buttonClassName = `
  inline-flex h-10 items-center justify-center rounded-lg px-4
  font-semibold text-white shadow-lg transition hover:brightness-110
`;

export const AdminButton: React.FC<AdminButtonProps> = ({
  onClick,
  children,
  className = "",
  style,
  href,
  target,
  title,
}) => {
  if (href) {
    return (
      <a
        href={href}
        target={target}
        title={title}
        className={`${buttonClassName} ${className}`.trim()}
        style={style}
      >
        {children}
      </a>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`${buttonClassName} ${className}`.trim()}
      style={style}
    >
      {children}
    </button>
  );
};

