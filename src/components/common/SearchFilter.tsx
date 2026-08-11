import React, { useRef } from 'react';

interface SearchFilterProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Replaces the default input styling, to match neighbouring controls. */
  inputClassName?: string;
}

export const SearchFilter: React.FC<SearchFilterProps> = ({
  id,
  label,
  value,
  onChange,
  placeholder = "Typ om te zoeken...",
  className = "",
  inputClassName = "p-2 border border-gray-300 rounded-md"
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className={`flex flex-col ${className}`}>
      <label htmlFor={id} className="text-sm font-medium text-gray-700">{label}</label>
      <input 
        ref={inputRef}
        type="search" 
        id={id}
        name={id}
        placeholder={placeholder}
        className={`mt-1 ${inputClassName}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}; 