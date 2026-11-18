import { createHash } from 'node:crypto';
import { HttpError } from '../../shared/http-error.js';
import { validateId } from '../../shared/query-validation.js';
import { peruDate } from '../../shared/peru-date.js';
import { requireActor } from '../matriculas/access.js';
import { createUsuariosService } from '../usuarios/usuarios.service.js';
import { createAdministrativeAuditService } from '../auditoria/service.js';
import { createStudentProfileRepository } from './profile.repository.js';
import { effectiveBinding } from './profile.rules.js';
import { lockPhoneStudent } from './phone.context.repository.js';
import { createGuardianPhoneRepository } from './phone.repository.js';
import { createPhoneTokens } from './phone.tokens.js';
import { previewPhone, phoneConfirmation, reliableContact, equivalentPhone } from './phone.validation.js';

const digest = context => createHash('sha256').update(JSON.stringify(context)).digest('hex');
export function createGuardianPhoneService({ repository = createGuardianPhoneRepository(), profiles = createStudentProfileRepository(),
  users = createUsuariosService(), audit = createAdministrativeAuditService(), tokens = createPhoneTokens(), getToday = peruDate } = {}) {
  async function run(studentId, actor, work) {
    return repository.transact(actor.id, async (connection, current) => {
      requireActor(current, false, true);
      const levels = current.rol === 'SUBDIRECCION' ? await users.supervisionLevels(current, connection) : null;
      const bindings = await lockPhoneStudent(connection, studentId, profiles), today = getToday();
      if (current.rol !== 'ADMIN') {
        const ids = current.rol === 'REGISTRADOR' ? await users.historicalSectionIds(current.id, today, today, connection) : null;
        if (!bindings.some(row => row.estado === 'ACTIVA' && effectiveBinding(row, today)
          && (ids ? ids.includes(row.id) : levels.includes(row.nivel)))) throw new HttpError(404, 'Estudiante no encontrado.');
      }
      const context = await repository.contactContext(connection, studentId);
      if (getToday() !== today) throw new HttpError(409, 'Cambió la fecha de vigencia. Vuelve a consultar.');
      if (!reliableContact(context.contact)) throw new HttpError(409, 'El apoderado requiere verificar su identidad antes de editar el celular.');
      return work(connection, context);
    });
  }
  function input(id, actor) { requireActor(actor); validateId(actor.id); validateId(id); }
  return {
    async previewGuardianPhone(id, body, actor) {
      input(id, actor); const phone = previewPhone(body);
      const proposal = await run(id, actor, async (_connection, context) => ({
        telefono_actual: context.contact.telefono, telefono_propuesto: phone,
        afecta_otros_vinculos: context.links.some(row => row.estudiante_id !== id),
        sin_cambios: equivalentPhone(context.contact.telefono, phone), fingerprint: digest(context),
      }));
      const { fingerprint, ...visible } = proposal;
      return { ...visible, ...(visible.sin_cambios ? { token_confirmacion: null, vence_en: null }
        : tokens.issue({ actorId: actor.id, studentId: id, phone, fingerprint })) };
    },
    async confirmGuardianPhone(id, body, actor) {
      input(id, actor);
      const proposal = tokens.take(phoneConfirmation(body), actor.id, id);
      return run(id, actor, async (connection, context) => {
        tokens.assertFresh(proposal);
        if (digest(context) !== proposal.fingerprint) throw new HttpError(409, 'El contacto o sus vínculos cambiaron. Solicita otra vista previa.');
        if (equivalentPhone(context.contact.telefono, proposal.phone)) return { telefono: context.contact.telefono, actualizado: false };
        const shared = context.links.some(row => row.estudiante_id !== id);
        await repository.update(connection, context.contact.id, proposal.phone);
        await audit.contactPhone(connection, actor.id, { id: context.contact.id, telefono: context.contact.telefono },
          { id: context.contact.id, telefono: proposal.phone, afecta_otros_vinculos: shared });
        return { telefono: proposal.phone, actualizado: true };
      });
    },
  };
}
