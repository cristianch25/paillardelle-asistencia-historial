import type { SupervisionSection } from './supervision/supervision.types';

export type SectionAttendanceStatus = { status: 'loading' | 'error' | 'outside-year' }
  | { status: 'ready'; item: SupervisionSection };
export type SectionAttendanceSummaries = Record<string, SectionAttendanceStatus>;
