import { cleanText, issue, phoneProposal } from './reconciliation-validation.js';

export function reconcileContact(row, studentId, data, visibleIds, actor, contactFileConflict) {
  const observations = row.issues.filter(item => item.ambito === 'apoderado'), actions = [];
  const fail = reason => observations.push(issue(row.original, 'apoderado', reason, 'apoderado'));
  if (!row.supplied) return { estado: 'VACIO', observations, actions };
  if (contactFileConflict) fail('CONTACTO_CONTRADICTORIO_EN_ARCHIVO');
  const matches = data.matches.filter(item => Number(item.source_index) === row.index);
  const existing = matches.length === 1 ? matches[0] : null;
  if (matches.length > 1) fail('CONTACTO_AMBIGUO');
  const active = link => link.activo === undefined || link.activo === true || link.activo === 1;
  const links = existing ? data.links.filter(link => link.contacto_id === existing.id && active(link)) : [];
  const authorized = !existing || actor.rol === 'ADMIN' || links.some(link => visibleIds.includes(link.estudiante_id));
  if (!authorized) fail('CONTACTO_REQUIERE_REVISION_ADMIN');
  if (authorized && existing && row.guardian.nombres_apellidos !== existing.nombres_apellidos) fail('DATOS_CONTACTO_CONTRADICTORIOS');
  const current = data.links.filter(link => link.estudiante_id === studentId && active(link));
  if (existing && data.links.some(link => link.estudiante_id === studentId && link.contacto_id === existing.id && !active(link))) {
    fail('VINCULO_HISTORICO_REQUIERE_REVISION');
  }
  if (current.length > 1 || (current.length && current[0].contacto_id !== existing?.id)) fail('SUSTITUCION_CONTACTO_PENDIENTE');
  if (current.length && existing && (cleanText(current[0].parentesco) !== row.guardian.parentesco)) fail('PARENTESCO_EXISTENTE_DIFIERE');
  if (observations.some(item => item.bloqueante !== false) || !row.contactDoc.fiable) return { estado: 'PENDIENTE_REVISION', observations, actions };
  if (!existing) actions.push({ tipo: 'CREAR_CONTACTO', identidad: row.contactDoc.numero_documento,
    datos: { tipo_documento: row.guardian.tipo_documento, numero_documento: row.guardian.numero_documento,
      nombres_apellidos: row.guardian.nombres_apellidos, telefono: row.phone.valor } });
  // Un teléfono vacío del Excel no borra un teléfono existente.
  if (existing && row.phone.valor !== null && row.phone.valor !== phoneProposal(existing.telefono).valor) {
    actions.push({ tipo: 'REVISAR_CAMBIO_TELEFONO', contacto_id: existing.id, antes: existing.telefono,
      despues: row.phone.valor, afecta_otros_vinculos: links.some(link => link.estudiante_id !== studentId),
      requiere_confirmacion_explicita: true });
  }
  if (!current.length) actions.push({ tipo: 'VINCULAR_CONTACTO', contacto_id: existing?.id ?? null,
    identidad_contacto: row.contactDoc.numero_documento, estudiante_id: studentId, parentesco: row.guardian.parentesco });
  return { estado: actions.length ? 'PROPUESTA' : 'SIN_CAMBIOS', observations, actions };
}

export function contactConflicts(rows) {
  const groups = new Map(), conflicts = new Set();
  for (const row of rows) if (row.contactDoc.fiable) {
    const key = row.contactDoc.numero_documento;
    const group = groups.get(key) ?? []; group.push(row); groups.set(key, group);
  }
  for (const group of groups.values()) {
    const variants = new Set(group.map(row => JSON.stringify([row.guardian, row.phone.valor, row.phone.original])));
    // Parentescos distintos entre hermanos no cambian la identidad del contacto.
    const identities = new Set(group.map(row => JSON.stringify([row.guardian.nombres_apellidos, row.phone.valor])));
    if (variants.size > 1 && identities.size > 1) for (const row of group) conflicts.add(row.index);
  }
  return conflicts;
}
