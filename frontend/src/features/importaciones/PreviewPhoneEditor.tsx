import { useId, useState } from 'react';
import type { PreviewRow } from './import.types';
import { normalizedPhone } from '../estudiantes/perfil/phone.api';
import Button from '../../shared/components/Button';

type Props = { row: PreviewRow; disabled: boolean; save: (phone: string | null, version: number) => Promise<boolean> };
export default function PreviewPhoneEditor({ row, disabled, save }: Props) {
  const [editing, setEditing] = useState(false), [value, setValue] = useState(''), [error, setError] = useState('');
  const id = useId(), contact = row.contacto;
  if (!contact) return null;
  if (contact.requiere_revision_identidad) return null;
  const hasIssue = row.observaciones.some(item => item.campo === 'apoderado.telefonos_originales'
    || item.motivo === 'CONTACTO_CONTRADICTORIO_EN_ARCHIVO');
  if (!contact.puede_corregir || !hasIssue && !contact.corregido) return null;
  return <div className="mt-3 min-w-0 space-y-2">
    {contact.corregido && !editing && <p className="text-sm font-semibold" role="status">Celular propuesto: {contact.telefono_propuesto ?? 'Sin celular'} · Corrección temporal</p>}
    {!editing ? <Button variant="secondary" disabled={disabled} onClick={() => {
      setValue(contact.telefono_propuesto ?? ''); setError(''); setEditing(true);
    }}>Corregir celular</Button> : <form aria-label="Corregir celular temporal" className="min-w-0 space-y-2" onSubmit={async event => {
      event.preventDefault(); setError('');
      try { const phone = normalizedPhone(value); if (await save(phone, contact.version)) setEditing(false); }
      catch (failure) { setError(failure instanceof Error ? failure.message : 'Revisa el celular.'); }
    }}>
      <p className="break-all text-xs text-slate-700">Original del Excel: {contact.telefono_original || 'Vacío'}</p>
      {contact.candidatos.length > 1 && <label className="block text-sm" htmlFor={`${id}-choice`}>Elegir un número principal
        <select id={`${id}-choice`} disabled={disabled} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-base"
          value={contact.candidatos.includes(value) ? value : ''} onChange={e => setValue(e.target.value)}>
          <option value="">Elegir o escribir abajo</option>{contact.candidatos.map(phone => <option key={phone} value={phone}>{phone}</option>)}
        </select></label>}
      <label htmlFor={id} className="block text-sm">Celular propuesto
        <input id={id} type="tel" inputMode="tel" autoComplete="off" maxLength={64} value={value} disabled={disabled}
          className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-base"
          onChange={e => setValue(e.target.value)} /></label>
      <p className="text-xs text-slate-600">Solo cambia esta vista previa. Vacío no borra un teléfono existente.</p>
      {error && <p role="alert" className="text-sm text-rose-900">{error}</p>}
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={disabled}>Guardar corrección temporal</Button>
        <Button variant="secondary" disabled={disabled} onClick={() => setEditing(false)}>Cancelar</Button></div>
    </form>}
  </div>;
}
