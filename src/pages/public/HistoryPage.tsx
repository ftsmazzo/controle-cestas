import { useMemo, useState } from 'react';
import { equipmentUnits } from '@shared/hierarchy';
import { parseMonthKey } from '@shared/monthUtils';
import { useData } from '../../context/DataContext';
import ConsumptionHeatmap from '../../components/ConsumptionHeatmap';

function num(n: number): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export default function HistoryPage() {
  const { loading, payload, dashboard } = useData();
  const [filtro, setFiltro] = useState<'todos' | 'validos'>('todos');
  const [nivel, setNivel] = useState<'total' | 'equipamento'>('total');
  const [equipId, setEquipId] = useState<string>('');

  const rows = useMemo(() => {
    if (!dashboard) return [];
    if (filtro === 'validos') {
      return dashboard.rows.filter((r) => r.usoNoModelo === 'Sim');
    }
    return dashboard.rows;
  }, [dashboard, filtro]);

  const equipamentos = useMemo(
    () => (payload ? equipmentUnits(payload.services) : []),
    [payload],
  );

  const serieEquipamento = useMemo(() => {
    if (!payload || nivel !== 'equipamento' || !equipId) return [];
    const map = new Map<string, number>();
    for (const h of payload.history) {
      if (h.servicoId !== equipId) continue;
      map.set(h.mes, (map.get(h.mes) ?? 0) + h.total);
    }
    return [...map.entries()]
      .sort((a, b) => parseMonthKey(a[0]) - parseMonthKey(b[0]))
      .map(([mes, total]) => ({ mes, total }));
  }, [payload, nivel, equipId]);

  if (loading) return null;

  if (!payload?.history.length || !dashboard) {
    return (
      <section className="panel empty">
        <p>Importe o histórico em /admin para visualizar consumo por equipamento.</p>
      </section>
    );
  }

  return (
    <>
      <section className="panel">
        <h2>Histórico de consumo</h2>
        <p className="hint">
          Total mensal (soma dos equipamentos). Drill-down por equipamento no mapa de
          calor. Nível <strong>Serviço</strong> (ex.: 12 CRAS) será habilitado quando a
          planilha segmentada estiver disponível.
        </p>
        <div className="upload-row">
          <label>
            Granularidade
            <select
              value={nivel}
              onChange={(e) => {
                setNivel(e.target.value as 'total' | 'equipamento');
                setEquipId('');
              }}
            >
              <option value="total">Total geral</option>
              <option value="equipamento">Por equipamento</option>
            </select>
          </label>
          {nivel === 'equipamento' && (
            <label>
              Equipamento
              <select
                value={equipId || equipamentos[0]?.id || ''}
                onChange={(e) => setEquipId(e.target.value)}
              >
                {equipamentos.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            Exibir
            <select
              value={filtro}
              onChange={(e) =>
                setFiltro(e.target.value as 'todos' | 'validos')
              }
            >
              <option value="todos">Todos os meses (incl. excluídos do modelo)</option>
              <option value="validos">Somente meses válidos para previsão</option>
            </select>
          </label>
        </div>
        {nivel === 'equipamento' && serieEquipamento.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: '1rem' }}>
            <table>
              <thead>
                <tr>
                  <th>Mês</th>
                  <th>Consumo equipamento</th>
                </tr>
              </thead>
              <tbody>
                {serieEquipamento.map((r) => (
                  <tr key={r.mes}>
                    <td>{r.mes}</td>
                    <td>{num(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Mês</th>
                <th>Total</th>
                <th>Status</th>
                <th>No modelo</th>
                <th>Observação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.mes}
                  className={
                    r.status === 'Ruptura de estoque'
                      ? 'row-ruptura'
                      : r.status === 'Parcial'
                        ? 'row-parcial'
                        : r.usoNoModelo === 'Não'
                          ? 'row-excluir'
                          : ''
                  }
                >
                  <td>{r.mes}</td>
                  <td>{num(r.total)}</td>
                  <td>{r.status}</td>
                  <td>{r.usoNoModelo}</td>
                  <td>{r.observacao || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h3>Mapa de calor — equipamento × mês</h3>
        <ConsumptionHeatmap
          services={payload.services}
          history={payload.history}
        />
      </section>
    </>
  );
}
