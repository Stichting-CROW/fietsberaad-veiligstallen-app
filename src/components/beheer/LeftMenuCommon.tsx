import { VSMenuTopic } from "~/types";
import type { IconType } from "react-icons";

export const LeftMenuItem = ({
  component,
  title,
  compact,
  children,
  activecomponent,
  onSelect,
  onClick,
  icon,
  isActive,
}: {
  component: VSMenuTopic | false,
  title: string,
  compact?: boolean,
  children?: React.ReactNode,
  activecomponent: VSMenuTopic | undefined,
  onSelect: (component: VSMenuTopic) => void,
  onClick?: () => void,
  icon?: IconType,
  isActive?: boolean,
}) => {
  const isSelected = component === activecomponent || isActive;
  const Icon = icon;

  if (!component) {
    return (
      <li className="pt-6 first:pt-0">
        <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {title}
        </div>
        <ul className="space-y-1">{children}</ul>
      </li>
    );
  }

  const baseClasses = `
    font-poppinsmedium
    flex items-center gap-3 rounded-lg px-3
    ${compact ? "py-1.5 text-sm" : "py-2 text-base"}
    transition-colors duration-150
    ${isSelected ? "bg-sky-50 text-sky-700 shadow-inner border border-sky-100" : "text-gray-700 hover:bg-gray-100"}
  `;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else {
      onSelect(component);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={baseClasses}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md ${
            isSelected ? "bg-sky-100 text-sky-600" : "bg-gray-100 text-gray-500"
          }`}
        >
          {Icon ? (
            <Icon className="h-4 w-4" />
          ) : (
            <span
              className={`block h-1.5 w-1.5 rounded-full ${
                isSelected ? "bg-sky-500" : "bg-gray-400"
              }`}
            />
          )}
        </span>
        <span className="truncate">{title}</span>
      </button>
      {children}
    </li>
  );
}
