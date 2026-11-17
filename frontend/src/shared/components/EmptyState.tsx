export default function EmptyState({ message }: { message: string }) {
  return <p role="status" className="rounded-lg bg-sky-soft p-5 text-sm leading-6 text-slate-700">{message}</p>;
}
