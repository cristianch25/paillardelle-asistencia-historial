import { CircleAlert } from 'lucide-react';

type ErrorStateProps = {
  message: string;
  title?: string;
};

export default function ErrorState({ message, title = 'No se pudo completar la acción' }: ErrorStateProps) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
      <CircleAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-accent-red" />
      <div className="min-w-0 space-y-1 break-words">
        <p className="text-sm font-semibold text-red-950">{title}</p>
        <p className="text-sm leading-6 text-red-900">{message}</p>
      </div>
    </div>
  );
}
