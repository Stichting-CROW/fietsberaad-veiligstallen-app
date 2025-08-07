import { VSMenuTopic } from "~/types";
import Link from 'next/link';

export const LeftMenuItem = ({
  component,
  title,
  compact,
  children,
  activecomponent,
  onSelect,
}: {
  component: VSMenuTopic | false,
  title: string,
  compact?: boolean,
  children?: React.ReactNode,
  activecomponent: VSMenuTopic | undefined,
  onSelect: (component: VSMenuTopic) => void,
}) => {
  const isSelected = component === activecomponent;
  const className = `block px-4 py-2 rounded ${isSelected ? "font-bold" : "hover:bg-gray-200"}`;
  const style = isSelected ? { backgroundColor: 'rgba(31, 153, 210, 0.1)' } : {};
  const classNamePassive = `block px-4 py-2 rounded cursor-default`;

  return (
    <li className={compact ? 'mb-2' : 'mb-1'}>
      {component ? (
        <Link href="#" onClick={(e) => { e.preventDefault(); onSelect(component) }} className={className} style={style}>
          {title}
        </Link>
      ) : (
        <Link href="#" onClick={(e) => { e.preventDefault() }} className={classNamePassive} style={style}>
          {title}
        </Link>
      )}
      {children}
    </li>
  );
}
