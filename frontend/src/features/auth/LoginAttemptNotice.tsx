export default function LoginAttemptNotice({ seconds }: { seconds: number }) {
  const wait = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  return <div role="status" className="space-y-1 text-sm text-slate-600">
    <p>{seconds > 0 ? `Por seguridad, podrás intentarlo nuevamente en ${wait}`
      : 'La espera indicada terminó. Puedes volver a intentarlo.'}</p>
  </div>;
}
