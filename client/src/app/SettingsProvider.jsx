import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../services/apiClient.js';
import { site } from '../config/site.js';

const FALLBACK = {
  name: site.clubName,
  shortName: site.clubShortName,
  timezone: 'Africa/Lagos',
  contact: {},
  social: {},
  stadium: {},
  values: [],
  honours: [],
  features: { comments: true, newsletter: true, playerApplications: true, staffApplications: true },
  seo: {},
  legalVersions: {},
};

const SettingsContext = createContext({ settings: FALLBACK, loaded: false, reload: () => {} });

/** Club identity and website settings from the database (edited in Dashboard > Settings). */
export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(FALLBACK);
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    try {
      const data = await apiRequest('/settings', { withAuth: false });
      setSettings({ ...FALLBACK, ...data, features: { ...FALLBACK.features, ...(data.features || {}) } });
    } catch {
      // Keep the fallback identity; pages show their own errors.
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  const value = useMemo(() => ({ settings, loaded, reload }), [settings, loaded, reload]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
