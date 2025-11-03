// FormSelect.tsx - Generic select field
import * as React from "react";

function FormSelect({
  innerRef,
  required,
  placeholder,
  className,
  style,
  onChange,
  value,
  label,
  options,
  disabled
}: {
  innerRef?: React.LegacyRef<HTMLSelectElement>,
  required?: boolean,
  placeholder?: string,
  className?: string,
  style?: React.CSSProperties,
  onChange?: React.ChangeEventHandler<HTMLSelectElement>,
  value?: any,
  label?: string,
  options: { label: string, value: string | undefined }[],
  disabled?: boolean
}) {
  return (
    <>
      <label>
        {label ? <div>
          <b>{label}</b>
        </div> : ''}
        <select
          ref={innerRef}
          required={required || false}
          onChange={onChange}
          value={value}
          style={style}
          className={`
            px-5
            py-2
            border
            rounded-full
            my-2
            ${disabled ? 'opacity-50 bg-gray-100 cursor-not-allowed' : ''}
            ${className}
          `}
          disabled={disabled === true}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option, idx) => (
            <option key={'fs-' + idx} value={option.value}>
              {option.label || option.value}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

export default FormSelect;