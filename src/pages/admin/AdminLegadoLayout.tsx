import { NavLink, Outlet } from 'react-router-dom';

const LEGADO_LINKS = [
  ['/admin/legado/importar', 'Importar histórico'],
  ['/admin/legado/contratos', 'Contratos'],
  ['/admin/legado/metodologia', 'Metodologia'],
  ['/admin/legado/sincronizar', 'Sincronizar'],
  ['/admin/legado/atendimentos', 'Atendimentos'],
] as const;

export default function AdminLegadoLayout() {
  return (
    <div>
      <section className="panel">
        <h1>Legado</h1>
        <p className="hint">
          Ferramentas antigas — importações históricas, contratos e metodologia.
          Não fazem parte do fluxo semanal. Oculte este menu em Configurações.
        </p>
        <nav className="shell-nav shell-nav--sub" aria-label="Legado">
          {LEGADO_LINKS.map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
      </section>
      <Outlet />
    </div>
  );
}
