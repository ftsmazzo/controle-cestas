import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';

export interface AppModeValue {
  adminPath: string;
  readOnly: boolean;
  isAdminRoute: boolean;
}

const AppModeContext = createContext<AppModeValue>({
  adminPath: '/admin',
  readOnly: true,
  isAdminRoute: false,
});

export function AppModeProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const value = useMemo((): AppModeValue => {
    const adminPath =
      (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim() || '/admin';
    const isAdminRoute = location.pathname.startsWith(adminPath);
    return {
      adminPath,
      readOnly: !isAdminRoute,
      isAdminRoute,
    };
  }, [location.pathname]);

  return (
    <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
  );
}

export function useAppMode(): AppModeValue {
  return useContext(AppModeContext);
}
