// FormInput.tsx - Generic input field
import * as React from "react";

function assignRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref && typeof ref === "object" && "current" in ref) {
    (ref as React.MutableRefObject<T | null>).current = value;
  }
}

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
  autoComplete,
  selectOnFocus,
  autoFocus,
  ...rest
}: {
  innerRef?: React.Ref<HTMLInputElement>,
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
  selectOnFocus?: boolean
  autoFocus?: boolean
  [key: string]: any
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const setRefs = React.useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      assignRef(innerRef, node);
    },
    [innerRef],
  );

  React.useLayoutEffect(() => {
    if (!autoFocus) return;
    const focusInput = () => inputRef.current?.focus();
    focusInput();
    const timeoutId = window.setTimeout(focusInput, 0);
    return () => window.clearTimeout(timeoutId);
  }, [autoFocus]);

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (selectOnFocus !== false) {
      // Select all text on focus by default, unless explicitly disabled
      e.target.select();
    }
  };

  return (
    <>
      <label>
        {label ? <div>
          <b>{label}</b>
        </div> : ''}
        <input
          ref={setRefs}
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
          onFocus={handleFocus}
          {...rest}
        />
      </label>
    </>
  );
}

export default FormInput;
