// FormInput.tsx - Generic input field
import * as React from "react";

function FormInput({
  innerRef,
  type,
  required,
  placeholder,
  className,
  onChange,
  value,
  label,
  size,
  style,
  defaultValue,
  disabled,
  autoComplete
}: {
  innerRef?: React.LegacyRef<HTMLInputElement>,
  type?: string,
  required?: boolean,
  placeholder?: string,
  className?: string,
  onChange?: React.ChangeEventHandler<HTMLInputElement>,
  value?: any
  defaultValue?: any
  label?: string,
  size?: number
  style?: object
  disabled?: boolean
  autoComplete?: string
}) {
  return (
    <>
      <label>
        {label ? <div>
          <b>{label}</b>
        </div> : ''}
        <input
          ref={innerRef}
          type={type || 'text'}
          placeholder={placeholder}
          required={required || false}
          onChange={onChange}
          value={value}
          defaultValue={defaultValue}
          size={size}
          style={style}
          className={`
            px-5
            py-2
            border
            rounded-full
            my-2
            w-full
            ${disabled ? 'opacity-50 bg-gray-100 cursor-not-allowed' : ''}
            ${className}
          `}
          disabled={disabled === true}
          autoComplete={autoComplete}
        />
      </label>
    </>
  );
}

export default FormInput;
