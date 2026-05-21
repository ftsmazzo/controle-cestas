import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';

export interface AppModeValue {
  /** URL da área de carga de dados (padrão /admin) */
  adminPath: string;
  /** true = somente leitura (rota pública) */
  readOnly: boolean;
  isAdminRoute: boolean;
}

const AppModeContext = createContext<AppModeValue>({
  adminPath: '/admin',
  readOnly: true,
  isAdminRoute: false,
});

export function AppModeProvider({ children }: { children: ReactNode }) {
  const value = useMemo((): AppModeValue => {
    const adminPath =
      (import.meta.env.VITE_ADMIN_PATH as string | undefined)?.trim() || '/admin';
    const normalized = window.location.pathname.replace(/\/$/, '') || '/';
    const isAdminRoute = normalized === adminPath;
    return {
      adminPath,
      readOnly: !isAdminRoute,
      isAdminRoute,
    };
  }, []);

  return (
    <AppModeContext.Provider value={value}>{children}</AppModeContext.Provider>
  );
}

export function useAppMode(): AppModeValue {
  return useContext(AppModeContext);
}
