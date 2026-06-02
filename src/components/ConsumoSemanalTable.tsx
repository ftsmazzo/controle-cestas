import { Fragment } from 'react';
import type { ConsumoSemanalEmergencial } from '@shared/consumoSemanalEmergencial';
import {
  MONITOR_CONTROLE_MES_INICIO,
  MONITOR_CONTROLE_SEMANA_INICIO,
} from '@shared/emergencyMonitoring';
import { formatSemanaCurta } from '@shared/monthUtils';
import PrintableTable from './ui/PrintableTable';
import './ConsumoSemanalTable.css';

function num(n: number, dec = 0): string {
  return n.toLocaleString('pt-BR', { maximumFractionDigits: dec });
}

interface Props {
  dados: ConsumoSemanalEmergencial;
}

function renderCelula(c: {
  quantidade: number;
  acimaCota: boolean;
  acimaMedia: boolean;
  excessoCota: number;
  excessoMedia: number;
}) {
  if (c.quantidade <= 0) return <td className="csem-cell csem-cell--zero">—</td>;
  const flags: string[] = [];
  if (c.acimaCota) flags.push(`+${num(c.excessoCota)} cota`);
  if (c.acimaMedia) flags.push(`+${num(c.excessoMedia)} média`);
  const cls = [
    'csem-cell',
    c.acimaCota && c.acimaMedia
      ? 'csem-cell--ambos'
      : c.acimaCota
        ? 'csem-cell--cota'
        : c.acimaMedia
          ? 'csem-cell--media'
          : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <td className={cls} title={flags.length ? flags.join(' · ') : undefined}>
      <strong>{num(c.quantidade)}</strong>
      {flags.length > 0 && (
        <span className="csem-cell-flag">
          {c.acimaCota && c.acimaMedia
            ? '⚠'
            : c.acimaCota
              ? 'C'
              : 'M'}
        </span>
      )}
    </td>
  );
}

export default function ConsumoSemanalTable({ dados }: Props) {
  if (!dados.temDados) {
    return (
      <p className="hint">
        Importe lançamentos semanais no Admin → Monitor para ver o consumo por
        equipamento.
      </p>
    );
  }

  const legend = (
    <div className="csem-legend">
      <span>
        <i className="csem-dot csem-dot--cota" /> Acima da cota semanal
      </span>
      <span>
        <i className="csem-dot csem-dot--media" /> Acima da média semanal
      </span>
      <span>
        <i className="csem-dot csem-dot--ambos" /> Acima dos dois
      </span>
    </div>
  );

  return (
    <div className="csem-wrap">
      <PrintableTable
        title="Consumo semanal por equipamento"
        subtitle={`Controle a partir de ${formatSemanaCurta(MONITOR_CONTROLE_MES_INICIO, MONITOR_CONTROLE_SEMANA_INICIO)} · ${dados.periodoLabel}`}
        legend={legend}
        wrapClassName="csem-table-wrap"
        orientation="landscape"
      >
        <table className="csem-table">
          <thead>
            <tr>
              <th className="csem-sticky">Equipamento</th>
              <th>Média/mês</th>
              <th>Cota/sem</th>
              <th>Méd/sem</th>
              {dados.colunas.map((col) => (
                <th key={`${col.mes}-${col.semana}`} title={col.periodo}>
                  {col.label}
                </th>
              ))}
              <th>Acum.</th>
              <th>+Cota</th>
              <th>+Média</th>
              <th>Sem.⚠</th>
            </tr>
            <tr className="csem-subhead">
              <th colSpan={4} className="csem-sticky" />
              {dados.colunas.map((col) => (
                <th key={`sub-${col.mes}-${col.semana}`} className="csem-sub-periodo">
                  {col.periodo}
                </th>
              ))}
              <th colSpan={4} />
            </tr>
          </thead>
          <tbody>
            {dados.familias.map((fam) => {
              const showChildren = fam.itens.length > 1;
              const acumFam = fam.itens.reduce((s, r) => s + r.acumulado, 0);
              return (
                <Fragment key={fam.familiaId}>
                  {showChildren && (
                    <tr className="csem-row-familia">
                      <td className="csem-sticky">
                        <strong>{fam.familiaNome}</strong>
                      </td>
                      <td colSpan={3} />
                      {dados.colunas.map((_, i) => {
                        const t = fam.itens.reduce(
                          (s, r) => s + (r.celulas[i]?.quantidade ?? 0),
                          0,
                        );
                        return (
                          <td key={i}>
                            <strong>{t > 0 ? num(t) : '—'}</strong>
                          </td>
                        );
                      })}
                      <td>
                        <strong>{num(acumFam)}</strong>
                      </td>
                      <td colSpan={3} />
                    </tr>
                  )}
                  {(showChildren ? fam.itens : fam.itens).map((r) => (
                    <tr key={r.servicoId} className="csem-row">
                      <td className="csem-sticky csem-nome">{r.servicoNome}</td>
                      <td>{r.mediaHistorica > 0 ? num(r.mediaHistorica) : '—'}</td>
                      <td>{r.cotaSemanal > 0 ? num(r.cotaSemanal) : '—'}</td>
                      <td>{r.mediaSemanal > 0 ? num(r.mediaSemanal) : '—'}</td>
                      {r.celulas.map((c, i) => (
                        <Fragment key={i}>{renderCelula(c)}</Fragment>
                      ))}
                      <td>
                        <strong>{num(r.acumulado)}</strong>
                      </td>
                      <td className={r.excessoAcumCota > 0 ? 'csem-over' : ''}>
                        {r.excessoAcumCota > 0 ? `+${num(r.excessoAcumCota)}` : '—'}
                      </td>
                      <td className={r.excessoAcumMedia > 0 ? 'csem-over' : ''}>
                        {r.excessoAcumMedia > 0 ? `+${num(r.excessoAcumMedia)}` : '—'}
                      </td>
                      <td className="csem-muted">
                        {r.semanasAcimaCota > 0 || r.semanasAcimaMedia > 0
                          ? `${r.semanasAcimaCota}/${r.semanasAcimaMedia}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="csem-sticky">
                <strong>TOTAL</strong>
              </td>
              <td colSpan={3} />
              {dados.totaisSemana.map((t, i) => (
                <td key={i}>
                  <strong>{t > 0 ? num(t) : '—'}</strong>
                </td>
              ))}
              <td>
                <strong>{num(dados.totaisSemana.reduce((a, b) => a + b, 0))}</strong>
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      </PrintableTable>
    </div>
  );
}
