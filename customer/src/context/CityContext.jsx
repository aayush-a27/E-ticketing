import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { fetchCities } from '../services/showService.js';
import { useAuth } from './AuthContext.jsx';
import * as authService from '../services/authService.js';

const CityContext = createContext(null);
const STORAGE_KEY = 'cinereserve.city';

/**
 * The city the customer is browsing.
 *
 * Kept in localStorage so an anonymous visitor is not asked twice, and mirrored
 * to the server's `preferredCity` for signed-in customers so the choice follows
 * them to another device. Geolocation is never requested — the city is always
 * chosen by hand.
 */
export function CityProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [cities, setCities] = useState([]);
  const [loadingCities, setLoadingCities] = useState(true);

  const [city, setCityState] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) ?? null;
    } catch {
      // Private browsing, or storage disabled. Not a problem worth surfacing.
      return null;
    }
  });

  useEffect(() => {
    const controller = new AbortController();

    fetchCities({ signal: controller.signal })
      .then(setCities)
      .catch(() => setCities([]))
      .finally(() => setLoadingCities(false));

    return () => controller.abort();
  }, []);

  // Adopt the server's preference when signing in, if nothing was chosen here.
  useEffect(() => {
    if (!isAuthenticated || city || !user?.preferredCity) return;
    setCityState(user.preferredCity);
    try {
      localStorage.setItem(STORAGE_KEY, user.preferredCity);
    } catch {
      /* ignore */
    }
  }, [isAuthenticated, user?.preferredCity, city]);

  const setCity = useCallback(
    (next) => {
      setCityState(next);
      try {
        if (next) localStorage.setItem(STORAGE_KEY, next);
        else localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }

      // Best effort: remembering the city must never block browsing.
      if (isAuthenticated && next) {
        authService.updateProfile({ preferredCity: next }).catch(() => {});
      }
    },
    [isAuthenticated],
  );

  const selectedCity = useMemo(
    () => cities.find((entry) => entry.city === city) ?? null,
    [cities, city],
  );

  const value = useMemo(
    () => ({
      city,
      cityLabel: selectedCity?.label ?? null,
      setCity,
      cities,
      loadingCities,
      // True once we know there are cities but none is chosen.
      needsCity: !loadingCities && cities.length > 0 && !city,
    }),
    [city, selectedCity, setCity, cities, loadingCities],
  );

  return <CityContext.Provider value={value}>{children}</CityContext.Provider>;
}

export function useCity() {
  const context = useContext(CityContext);
  if (!context) throw new Error('useCity must be used inside CityProvider');
  return context;
}
