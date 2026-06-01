import { NavLink, Outlet } from 'react-router-dom';
import { useData } from '../context/DataContext';
import './Shell.css';

const ADMIN_NAV = [
  ['/admin/importar', 'Importar'],
  ['/admin/equipamentos', 'Equipamentos'],
  ['/admin/metodologia', 'Metodologia'],
  ['/admin/contratos', 'Contratos'],
  ['/admin/monitoramento', 'Monitor emergencial'],
  ['/admin/sincronizar', 'Sincronizar'],
  ['/admin/atendimentos', 'Atendimentos (futuro)'],
] as const;

export default function AdminLayout() {
  const { apiOk, error, loading } = useData();

  return (
    <div className="app">
      <div className="app-nav-sticky shell-sticky">
        <header className="header">
          <div>
            <h1>Administração — Cestas Básicas</h1>
            <p className="subtitle">Carga de dados, metodologia e parâmetros</p>
          </div>
          <div className="header-badges">
            <span className="mode-badge mode-admin">Administração</span>
            <span className={`api-badge ${apiOk ? 'api-ok' : 'api-fail'}`}>
              {apiOk ? 'PostgreSQL conectado' : 'API offline'}
            </span>
            <a className="admin-link" href="/">
              Voltar à consulta pública →
            </a>
          </div>
        </header>

        <nav className="shell-nav" aria-label="Administração">
          {ADMIN_NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {loading && <p className="loading-msg">Carregando…</p>}
      {error && <p className="error">{error}</p>}

      <Outlet />
    </div>
  );
}
