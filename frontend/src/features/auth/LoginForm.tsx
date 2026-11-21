import { useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { Eye, EyeOff, LockKeyhole, UserRound } from 'lucide-react';
import Button from '../../shared/components/Button';
import FormField from '../../shared/components/FormField';
import ErrorState from '../../shared/components/ErrorState';
import LoadingState from '../../shared/components/LoadingState';
import { apiErrorMessage } from '../../shared/api/apiError';
import { useAuth } from './AuthContext';

export default function LoginForm() {
  const { signIn } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ usuario?: string; password?: string }>({});
  const submitting = useRef(false);
  const userInput = useRef<HTMLInputElement>(null);
  const passwordInput = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const errors = {
      usuario: !usuario.trim() || Array.from(usuario).length > 60 ? 'Ingresa un usuario de hasta 60 caracteres.' : undefined,
      password: !password || new TextEncoder().encode(password).length > 72 ? 'Ingresa una contraseña de hasta 72 bytes UTF-8.' : undefined,
    };
    setFieldErrors(errors);
    setError('');
    if (errors.usuario || errors.password) {
      (errors.usuario ? userInput : passwordInput).current?.focus();
      return;
    }
    submitting.current = true;
    setBusy(true);
    try {
      await signIn({ usuario, password });
    } catch (failure) {
      if (!axios.isCancel(failure)) setError(apiErrorMessage(failure, true));
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
          spellCheck={false} required value={usuario} onChange={event => setUsuario(event.target.value)}
          disabled={busy} error={fieldErrors.usuario} />
        <UserRound aria-hidden="true" className="pointer-events-none absolute left-0 top-0.5 size-4 text-slate-500" />
      </div>
      <div className="relative [&_label]:pl-6 [&_label>span]:hidden">
        <FormField ref={passwordInput} id="login-password" label="Contraseña" name="password"
          type={showPassword ? 'text' : 'password'} autoComplete="current-password"
          required value={password} onChange={event => setPassword(event.target.value)}
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
      {busy && <LoadingState message="Verificando tu cuenta…" />}
      <Button type="submit" disabled={busy} className="min-h-12 w-full shadow-sm transition-shadow enabled:hover:shadow-md focus-visible:outline-offset-4">{busy ? 'Iniciando sesión…' : 'Iniciar sesión'}</Button>
    </form>
  );
}
