import { InputHTMLAttributes, forwardRef } from 'react';
import { clsx } from 'clsx';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, ...props }, ref) => {
    const inputId = id || props.name;

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-gray-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={clsx(
            'block w-full rounded-lg border shadow-sm text-sm transition-colors',
            'focus:ring-2 focus:ring-offset-0 focus:outline-none',
            error
              ? 'border-red-300 focus:border-red-500 focus:ring-red-500/20 bg-red-50/30'
              : 'border-gray-200 focus:border-primary-500 focus:ring-primary-500/20 bg-white',
            'disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed',
            'px-3 py-2 placeholder:text-gray-400',
            className
          )}
          {...props}
        />
        {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
        {hint && !error && <p className="mt-1.5 text-xs text-gray-400">{hint}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';

export default Input;
