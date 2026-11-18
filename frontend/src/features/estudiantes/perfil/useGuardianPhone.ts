import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { normalizedPhone, previewGuardianPhone, confirmGuardianPhone, type PhonePreview } from './phone.api';

export function useGuardianPhone(studentId: string, initialPhone: string | null, onBusyChange?: (busy: boolean) => void) {
  const [phone, setPhone] = useState(initialPhone), [input, setInput] = useState(initialPhone ?? '');
  const [phase, setPhase] = useState<'view' | 'editing' | 'previewing' | 'preview' | 'saving' | 'uncertain'>('view');
  const [preview, setPreview] = useState<PhonePreview | null>(null), [message, setMessage] = useState('');
  const inFlight = useRef(false), alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  function busy(value: boolean) { inFlight.current = value; if (alive.current) onBusyChange?.(value); }
  function cancel() { if (!inFlight.current) { setPhase('view'); setPreview(null); setMessage(''); setInput(phone ?? ''); } }
  async function prepare() {
    if (inFlight.current) return;
    let value;
    try { value = normalizedPhone(input); } catch (error) { setMessage((error as Error).message); return; }
    busy(true); setPhase('previewing'); setMessage('');
    try {
      const proposal = await previewGuardianPhone(studentId, value);
      if (!alive.current) return;
      setPhone(proposal.telefono_actual);
      if (proposal.sin_cambios) { setPhone(proposal.telefono_actual); setPhase('view'); setMessage('No hay cambios en el número.'); }
      else { setPreview(proposal); setPhase('preview'); }
    } catch (error) {
      if (alive.current) {
        setPhase('editing');
        setMessage(axios.isAxiosError(error) && error.response?.status === 409
          ? 'Actualiza el perfil o solicita revisar la identidad del apoderado.' : 'No se pudo revisar el número. Verifica los datos e intenta nuevamente.');
      }
    } finally { busy(false); }
  }
  async function confirm() {
    if (inFlight.current || !preview?.token_confirmacion || phase !== 'preview') return;
    busy(true); setPhase('saving'); setMessage('');
    try {
      const result = await confirmGuardianPhone(studentId, preview.token_confirmacion);
      if (alive.current) { setPhone(result.telefono); setInput(result.telefono ?? ''); setPhase('view'); setPreview(null);
        setMessage(result.actualizado ? 'Número actualizado.' : 'No hay cambios en el número.'); }
    } catch {
      if (alive.current) { setPhase('uncertain'); setPreview(null); setMessage('No se pudo confirmar el cambio. Consulta el número actual antes de volver a editar.'); }
    } finally { busy(false); }
  }
  return { phone, input, setInput, phase, preview, message, prepare, confirm, cancel,
    busy: phase === 'previewing' || phase === 'saving',
    edit: () => { if (!inFlight.current) { setMessage(''); setInput(phone ?? ''); setPhase('editing'); } } };
}
