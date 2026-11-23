import { useEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import Button from '../../shared/components/Button';
import FormField from '../../shared/components/FormField';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { apiErrorMessage } from '../../shared/api/apiError';
import { useAuth } from './AuthContext';
import LoginAttemptNotice from './LoginAttemptNotice';
import { loginFeedback, loginFieldErrors, type LoginFeedback } from './loginFeedback';
import { loginWaitSeconds, watchLoginWait } from './loginWait';

export default function LoginForm() {
  const { signIn } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<LoginFeedback | null>(null);
  const [now, setNow] = useState(Date.now);
  const waitUntil = feedback?.waitUntil ?? null;
  const seconds = loginWaitSeconds(feedback, now);
  useEffect(() => watchLoginWait(waitUntil, setNow), [waitUntil]);
  const [fieldErrors, setFieldErrors] = useState<{ usuario?: string; password?: string }>({});
  const submitting = useRef(false);
  const userInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || loginWaitSeconds(feedback, Date.now()) > 0) return;
    const errors = loginFieldErrors(usuario, password);
    setFieldErrors(errors);
    setError('');
    setFeedback(null);
    if (errors.usuario || errors.password) {
      (errors.usuario ? userInput : passwordInput).current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await signIn({ usuario, password });
    } catch (failure) {
      if (!axios.isCancel(failure)) {
        const next = loginFeedback(failure), message = apiErrorMessage(failure, true);
        setError(next?.remaining && !next.waitUntil
          ? `${message}. Te ${next.remaining === 1 ? 'queda 1 intento' : `quedan ${next.remaining} intentos`}` : message);
        setFeedback(next);
      }
    } finally {
      setPassword('');
      setShowPassword(false);
      setBusy(false);
      submitting.current = false;
    }
  }

  return (
    <form onSubmit={submit} noValidate aria-busy={busy} className="space-y-5">
      <div className="relative [&_label]:pl-6 [&_label>span]:hidden">
        <FormField ref={userInput} label="Usuario" name="usuario" autoComplete="username" autoCapitalize="none"
          spellCheck={false} required value={usuario} onChange={event => {
            setUsuario(event.target.value);
            setFeedback(current => current?.waitUntil && current.waitUntil > Date.now() ? { ...current, remaining: null } : null);
            if (!seconds) setError(''); setFieldErrors(current => ({ ...current, usuario: undefined }));
          }}
          disabled={busy} error={fieldErrors.usuario} />
        <UserRound aria-hidden="true" className="pointer-events-none absolute left-0 top-0.5 size-4 text-slate-500" />
      </div>
      <div className="relative [&_label]:pl-6 [&_label>span]:hidden">
        <FormField ref={passwordInput} id="login-password" label="Contraseña" name="password"
          type={showPassword ? 'text' : 'password'} autoComplete="current-password"
          required value={password} onChange={event => {
            setPassword(event.target.value); setFieldErrors(current => ({ ...current, password: undefined }));
          }}
          disabled={busy} error={fieldErrors.password} className="pr-14" />
        <LockKeyhole aria-hidden="true" className="pointer-events-none absolute left-0 top-0.5 size-4 text-slate-500" />
        <button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          aria-controls="login-password" aria-pressed={showPassword} disabled={busy}
          onClick={() => setShowPassword(visible => !visible)}
          className="absolute right-1 top-7 inline-flex size-11 items-center justify-center rounded-md text-slate-500 transition-colors enabled:hover:bg-sky-soft enabled:hover:text-institutional-800 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-institutional-700 disabled:cursor-not-allowed">
          {showPassword ? <EyeOff aria-hidden="true" className="size-5" /> : <Eye aria-hidden="true" className="size-5" />}
        </button>
      </div>
      {error && <ErrorState title="No se pudo iniciar sesión" message={error} />}
      {feedback?.waitUntil && <LoginAttemptNotice seconds={seconds} />}
      {busy && <LoadingState message="Verificando tu cuenta…" />}
      <Button type="submit" disabled={busy || seconds > 0} className="min-h-12 w-full shadow-sm transition-shadow enabled:hover:shadow-md focus-visible:outline-offset-4">{busy ? 'Iniciando sesión…' : 'Iniciar sesión'}</Button>
    </form>
  );
}
