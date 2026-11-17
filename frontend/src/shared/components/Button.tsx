import type { ComponentProps } from 'react';

type ButtonProps = ComponentProps<'button'> & {
  variant?: 'primary' | 'secondary' | 'tertiary';
};

const variants = {
  primary: 'border-institutional-800 bg-institutional-800 text-white enabled:hover:bg-institutional-950',
  secondary: 'border-slate-300 bg-white text-institutional-950 enabled:hover:bg-slate-100',
  tertiary: 'border-transparent bg-transparent text-slate-600 enabled:hover:bg-slate-100',
};

export default function Button({ variant = 'primary', type = 'button', className = '', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-institutional-700 disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}
