// FormCheckbox.tsx - Generic checkbox component
import * as React from "react";

function FormCheckbox({
  required,
  classes,
  checked,
  defaultChecked,
  onChange,
  children,
  disabled,
}: {
  required?: boolean,
  classes?: string,
  checked?: boolean,
  defaultChecked?: boolean,
  onChange?: React.ChangeEventHandler<HTMLInputElement> | undefined,
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
        type={'checkbox'}
        required={required}
        checked={checked}
        defaultChecked={defaultChecked}
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

export default FormCheckbox;
