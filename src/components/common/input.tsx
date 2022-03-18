import clsx from 'clsx';
import { createRef } from 'preact';

interface InputProps {
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  error?: boolean;
  value?: string;
  big?: boolean;
  maxLength?: number;
  password?: boolean;
  setValue(value: string): void;
}

export function Input({ label, placeholder, disabled, error, big, maxLength, password, value, setValue }: InputProps) {
  const ref = createRef();
  return (
    <div class="flex flex-col gap-2">
      <label
        class={clsx('block text-sm font-medium font-display text-zinc-400', {
          'text-center text-base': big
        })}
        onClick={() => {
          if (!disabled) ref.current?.focus();
        }}
      >
        {label}
      </label>
      <input
        value={value}
        class={clsx('py-1 px-3 rounded bg-zinc-800 font-body outline-none focus:ring-1 placeholder:text-zinc-500', {
          'focus:ring-teal-500': !error,
          'focus:ring-red-300 text-red-500': !!error,
          'bg-opacity-50 cursor-not-allowed': disabled,
          'text-lg': big
        })}
        disabled={disabled}
        placeholder={placeholder}
        ref={ref}
        maxLength={maxLength}
        type={password ? 'password' : 'text'}
        onChange={(e) => setValue(e.currentTarget.value)}
      />
    </div>
  );
}
