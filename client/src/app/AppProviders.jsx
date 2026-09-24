import { AuthProvider } from '../auth/AuthProvider.jsx';
import { SettingsProvider } from './SettingsProvider.jsx';
import { ToastProvider } from '../components/ui/Toast.jsx';

export function AppProviders({ children }) {
  return (
    <SettingsProvider>
      <AuthProvider>
        <ToastProvider>{children}</ToastProvider>
      </AuthProvider>
    </SettingsProvider>
  );
}
