import React, { useState } from 'react';

interface CollapsibleContentProps {
  children: React.ReactNode;
  buttonText?: string;
  className?: string;
  isOpen?: boolean;
}

const CollapsibleContent: React.FC<CollapsibleContentProps> = ({
  children,
  buttonText = 'Toggle Content',
  className = '',
  isOpen = false,
}) => {
  const [isVisible, setIsVisible] = useState(isOpen);

  return (
    <div className={className}>
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="w-full px-4 py-2 text-left bg-gray-100 hover:bg-gray-200 rounded-md mb-2"
      >
        {buttonText} {isVisible ? '▼' : '▶'}
      </button>
      <div className={`${isVisible ? 'block' : 'hidden'}`}>
        <div className="mt-2">
          {children}
        </div>
      </div>
    </div>
  );
};

export default CollapsibleContent; 