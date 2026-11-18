import Button from '../../../shared/components/Button';
import { useStudentProfile } from './StudentProfileContext';
import type { ProfileSelection } from './profile.types';
export default function StudentProfileButton(props: ProfileSelection & { disabled?: boolean }) {
  const open = useStudentProfile();
  return open ? <Button variant="secondary" disabled={props.disabled} onClick={() => open(props)}>Ver perfil</Button> : null;
}
