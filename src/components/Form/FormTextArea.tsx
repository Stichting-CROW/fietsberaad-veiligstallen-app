// FormInput.tsx - Generic input field
import * as React from "react";

function FormTextArea({
  required,
  placeholder,
  className,
  onChange,
  value,
  label,
  style,
  rows,
  disabled
}: {
  required?: boolean,
  placeholder?: string,
  className?: string,
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>,
  value?: any
  label?: string,
  rows?: number,
  style?: object,
  disabled?: boolean
}) {
  return (
    <>
      <label>
        {label ? <div>
          <b>{label}</b>
        </div> : ''}
    		<textarea
          placeholder={placeholder}
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
          rows={rows}
          disabled={disabled}
        />
      </label>
    </>
  );
}

export default FormTextArea;
