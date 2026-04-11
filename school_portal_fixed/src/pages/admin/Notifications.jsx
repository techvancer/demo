import { t, getField, getStudentName as _getStudentName } from '../../lib/langHelper';
import { useLang } from '../../context/LanguageContext';
import SupervisorNotifications from '../supervisor/Notifications';

export default function AdminNotifications() {
    const { lang, isAr } = useLang();

    // Reusing the notifications management logic as it's consistent for both Admin and Supervisor roles
    return <SupervisorNotifications />;
}
