import { useSectionListLocation } from './useSectionListLocation';
import Button from '../../../shared/components/Button';
import { useLocation, useNavigate } from 'react-router';
import EmptyState from '../../../shared/components/EmptyState';
import ErrorState from '../../../shared/components/ErrorState';
import LoadingState from '../../../shared/components/LoadingState';
import Pagination from '../../../shared/components/Pagination';
import { useSchoolYears } from '../anios-escolares/useSchoolYears';
import { useSectionSelection } from './SeccionSelectionContext';
import type { Section } from './secciones.types';
import SeccionesList from './SeccionesList';
import { useRegistrarDay } from '../../inicio/useRegistrarDay';
import SectionAttendanceSummary from '../../asistencias/SectionAttendanceSummary';
import { useAuth } from '../../auth/AuthContext';
import { validCivilDate } from '../../../shared/dates/civilDate';
import AssignedStudentSearch from '../../asistencias/AssignedStudentSearch';
import { formatRegistrarSectionName } from './sectionPresentation';

export default function MisSeccionesPage() {
  const { page, setPage } = useSectionListLocation();
  const years = useSchoolYears();
  const selection = useSectionSelection();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { attendanceDate: date, setAttendanceDate: setDate } = selection;
  const attendance = useRegistrarDay(years.years, !years.loading && !years.error, date);
  const rows = attendance.data?.slice((page - 1) * 20, page * 20) ?? [];
  async function openSection(section: Section, destination: 'asistencia' | 'estudiantes') {
    const year = years.years.find(item => item.id === section.anio_escolar_id);
    if (year && await selection.select({ section, year })) {
      await navigate(`${destination === 'asistencia' ? '/asistencias/diaria' : '/secciones/estudiantes'}${location.search}`, { state: { fecha: date } });
    }
  }
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Mis secciones</h1>
      </div>
      <AssignedStudentSearch key={`${session?.user.id}:${session?.expiresAt}`} years={years.years}
        date={date} onDateChange={value => { setDate(value); setPage(1); }} onSaved={attendance.retry} />
      {selection.checking && <LoadingState message="Comprobando la sección…" />}
      {selection.error && <ErrorState message={selection.error} />}
      {attendance.loading && <LoadingState message="Cargando mis secciones…" />}
      {attendance.error && <div className="space-y-3"><ErrorState message={attendance.error} />
        <Button variant="secondary" onClick={attendance.retry}>Reintentar consulta</Button></div>}
      {years.loading && <LoadingState message="Cargando años escolares…" />}
      {years.error && <div className="space-y-3"><ErrorState message={years.error} />
        <p className="text-sm text-slate-600">Para seleccionar una sección, vuelve a cargar los años escolares.</p>
        <Button variant="secondary" onClick={years.retry}>Reintentar carga de años</Button></div>}
      {attendance.data && <div className="space-y-6">
        {rows.length ? <SeccionesList sections={rows.map(row => row.seccion)} years={years.years}
          formatName={formatRegistrarSectionName} attendanceLabel="Registrar asistencia"
          compact showAttendance showStudents
          checking={selection.checking || years.loading || Boolean(years.error) || !validCivilDate(date)}
          renderSummary={section => <SectionAttendanceSummary compact date={attendance.date}
            summary={{ status: 'ready', item: rows.find(row => row.seccion.id === section.id)! }} />}
          onOpen={(section, destination) => void openSection(section, destination)} />
          : <EmptyState message="No hay secciones disponibles en esta página para tu cuenta." />}
        <Pagination pagination={{ page, limit: 20, has_more: page * 20 < attendance.data.length }} onPageChange={setPage} />
      </div>}
    </div>
  );
}
