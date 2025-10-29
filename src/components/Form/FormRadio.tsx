// FormRadio.tsx - Generic radio button component
import * as React from "react";

function FormRadio({
  required,
  classes,
  checked,
  defaultChecked,
  onChange,
  name,
  value,
  children,
  disabled,
}: {
  required?: boolean,
  classes?: string,
  checked?: boolean,
  defaultChecked?: boolean,
  onChange?: React.ChangeEventHandler<HTMLInputElement> | undefined,
  name?: string,
  value?: string,
  children?: any,
  disabled?: boolean,
}) {
  return (
    <label
      className={`
        inline-block
        mx-5
        ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}
        ${classes}
      `}
    >
      <input
        type={'radio'}
        required={required}
        checked={checked}
        defaultChecked={defaultChecked}
        name={name}
        value={value}
        className="
          mr-2
          my-2
          inline-block
        "
        onChange={(e) => (onChange ? onChange(e) : () => { })}
        disabled={disabled}
      />
      {children}
    </label>
  );
}

export default FormRadio;


