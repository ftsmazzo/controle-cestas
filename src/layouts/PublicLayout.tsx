import { NavLink, Outlet } from 'react-router-dom';
import { useAppMode } from '../context/AppModeContext';
import { useData } from '../context/DataContext';
import './Shell.css';

const NAV = [
  ['/', 'Painel de decisão'],
  ['/historico', 'Consumo'],
  ['/contrato-emergencial', 'Monitor emergencial'],
  ['/metodologia', 'Metodologia'],
] as const;

export default function PublicLayout() {
  const { adminPath } = useAppMode();
  const { apiOk, error, loading } = useData();

  return (
    <div className="app">
      <div className="app-nav-sticky shell-sticky">
        <header className="header">
          <div>
            <h1>Dashboard de Cestas Básicas</h1>
            <p className="subtitle">
              Monitoramento do processo emergencial — consulta de consumo e cotas
            </p>
          </div>
          <div className="header-badges">
            <span className="mode-badge mode-consulta">Consulta</span>
            <span className={`api-badge ${apiOk ? 'api-ok' : 'api-fail'}`}>
              {apiOk ? 'PostgreSQL conectado' : 'API offline'}
            </span>
            <a className="admin-link" href={adminPath}>
              Área administrativa →
            </a>
          </div>
        </header>

        <nav className="shell-nav" aria-label="Navegação principal">
          {NAV.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : undefined)}
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>

      {loading && <p className="loading-msg">Carregando dados…</p>}
      {error && <p className="error">{error}</p>}

      <Outlet />
    </div>
  );
}
