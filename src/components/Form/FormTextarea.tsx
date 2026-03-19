// FormTextarea.tsx - Generic textarea field
import * as React from "react";

function FormTextarea({
  innerRef,
  required,
  placeholder,
  className,
  onChange,
  value,
  label,
  rows,
  disabled,
  ...rest
}: {
  innerRef?: React.LegacyRef<HTMLTextAreaElement>;
  required?: boolean;
  placeholder?: string;
  className?: string;
  onChange?: React.ChangeEventHandler<HTMLTextAreaElement>;
  value?: string;
  label?: string;
  rows?: number;
  disabled?: boolean;
  [key: string]: any;
}) {
  return (
    <>
      <label>
        {label ? (
          <div>
            <b>{label}</b>
          </div>
        ) : (
          ""
        )}
        <textarea
          ref={innerRef}
          placeholder={placeholder}
          required={required ?? false}
          onChange={onChange}
          value={value}
          rows={rows ?? 4}
          className={`
            px-5
            py-2
            border
            rounded-md
            my-2
            w-full
            ${disabled ? "opacity-50 bg-gray-100 cursor-not-allowed" : ""}
            ${className ?? ""}
          `}
          disabled={disabled === true}
          {...rest}
        />
      </label>
    </>
  );
}

export default FormTextarea;
