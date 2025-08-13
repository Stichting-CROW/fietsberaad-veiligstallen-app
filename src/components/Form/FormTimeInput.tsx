import React, { useState, useEffect } from 'react';
import moment from 'moment';

type FormTimeInputProps = {
  label?: string;
  required?: boolean;
  className?: string;
  onChange: (date: Date|null) => void;
  value?: Date|null;
  size?: number
  style?: object
  disabled?: boolean
};

const FormTimeInput: React.FC<FormTimeInputProps> = ({ 
  label, 
  required,
  className,
  onChange,
  value, 
  size,
  style,
  disabled }) => {
  const [newValue, setNewValue] = useState<moment.Moment|null>(null);

  const getHours = () => {
    if(newValue === null) {
      return moment(value).utcOffset(0).format('H');
    }

    return newValue.utcOffset(0).format('H');
  }

  const getMinutes = () => {
    if(newValue === null) {
      return moment(value).utcOffset(0).format('m');
    }

    return newValue.utcOffset(0).format('m');
  }

  const handleChange = (hours: string, minutes: string) => {
    const newDate = moment(value).utcOffset(0);
    const validHours = isNaN(parseInt(hours, 10)) ? 0 : Math.max(0, Math.min(23, parseInt(hours, 10)));
    const validMinutes = isNaN(parseInt(minutes, 10)) ? 0 : Math.max(0, Math.min(59, parseInt(minutes, 10)));

    newDate.set('hours', validHours);
    newDate.set('minutes', validMinutes);

    setNewValue(newDate);

    onChange(newDate.toDate());
  };

  return (
    <>
      <label>
        {label ? <div>
          <b>{label}</b>
        </div> : ''}
        <div>
        <input
          type="number"
          value={getHours()}
          placeholder={"hh"}
          required={required || false}
          onChange={(e) => {
            handleChange(e.target.value, getMinutes());
          }}
          min="0"
          max="23"
          size={size}
          style={style}
          className={`
              px-5
              py-2
              border
              rounded-full
              my-2
              ${className}
            `}
          disabled={disabled === true}
        />
        <span>:</span>
        <input
          type="number"
          value={getMinutes()}
          placeholder={"mm"}
          required={required || false}
          onChange={(e) => {
            handleChange(getHours(), e.target.value);
          }}
          min="0"
          max="59"
          size={size}
          style={style}
          className={`
              px-5
              py-2
              border
              rounded-full
              my-2
              ${className}
            `}
          disabled={disabled === true}
        />
        <b>uur</b>
      </div>
      </label>
    </>
  );
};

export default FormTimeInput; 