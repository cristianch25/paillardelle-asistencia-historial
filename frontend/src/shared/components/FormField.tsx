import { useId, type ComponentProps } from 'react';

type FormFieldProps = ComponentProps<'input'> & {
  label: string;
  hint?: string;
  error?: string;
};

export default function FormField({ label, hint, error, id, className = '',
  'aria-describedby': describedBy, ...props }: FormFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const description = [describedBy, hint ? hintId : '', error ? errorId : ''].filter(Boolean).join(' ');

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-semibold text-institutional-950">
        {label}{props.required && <span className="ml-1 text-accent-red" aria-hidden="true">*</span>}
      </label>
      <input
        {...props}
        id={inputId}
        aria-invalid={error ? true : props['aria-invalid']}
        aria-describedby={description || undefined}
        className={`block min-h-11 w-full rounded-lg border bg-white px-3 py-2.5 text-base text-slate-900 placeholder:text-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 disabled:cursor-not-allowed disabled:bg-slate-100 ${error ? 'border-accent-red' : 'border-slate-300'} ${className}`}
      />
      {hint && <p id={hintId} className="text-sm leading-6 text-slate-600">{hint}</p>}
      {error && <p id={errorId} role="alert" className="text-sm font-medium text-accent-red">{error}</p>}
    </div>
  );
}
