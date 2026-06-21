import {
  UNIDADE_MAOS_DADAS,
  UNIDADE_SAICA,
  UNIDADE_WARAOS,
} from '@shared/coderpRequisitanteRules';
import type { FixosReaisPorCiclo } from '@shared/emergencyMonitoring';
import type { ServicesPayload } from '@shared/serviceTypes';

function parseQty(s: string): number {
  const v = parseFloat(s.replace(/\./g, '').replace(',', '.'));
  return Number.isNaN(v) ? 0 : Math.max(0, Math.round(v));
}

interface Props {
  data: ServicesPayload;
  cicloAtual: number;
  readOnly?: boolean;
  onUpdate: (next: ServicesPayload) => void;
}

export default function MonitorAjustesOperacionais({
  data,
  cicloAtual,
  readOnly,
  onUpdate,
}: Props) {
  const mon = data.emergencial.monitoramento;
  const fixos = mon.fixosReaisPorCiclo?.[cicloAtual] ?? {};

  const patch = (
    perda: number | null,
    fixosPatch: FixosReaisPorCiclo,
  ) => {
    onUpdate({
      ...data,
      emergencial: {
        ...data.emergencial,
        monitoramento: {
          ...mon,
          perdaAjuste: perda,
          fixosReaisPorCiclo: {
            ...mon.fixosReaisPorCiclo,
            [cicloAtual]: fixosPatch,
          },
        },
      },
    });
  };

  return (
    <section className="panel monitor-ajustes">
      <h3>Ajustes do período {cicloAtual}</h3>
      <p className="hint">
        Fixos reais quando pediram menos que o planejado (sobra volta ao rateio).
        Perdas = pequeno desconto no restante proporcional.
      </p>
      <div className="monitor-ajustes-grid">
        <label>
          Perdas (cestas)
          <input
            type="text"
            inputMode="numeric"
            disabled={readOnly}
            placeholder="0"
            value={mon.perdaAjuste != null ? String(mon.perdaAjuste) : ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              patch(v === '' ? null : parseQty(v), fixos);
            }}
          />
        </label>
        <label>
          SAICA (real no período)
          <input
            type="text"
            inputMode="numeric"
            disabled={readOnly}
            placeholder="25"
            value={fixos.SAICA != null ? String(fixos.SAICA) : ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              patch(mon.perdaAjuste ?? null, {
                ...fixos,
                SAICA: v === '' ? undefined : parseQty(v),
              });
            }}
          />
        </label>
        <label>
          WARAOS (real)
          <input
            type="text"
            inputMode="numeric"
            disabled={readOnly}
            placeholder="29"
            value={fixos.WARAOS != null ? String(fixos.WARAOS) : ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              patch(mon.perdaAjuste ?? null, {
                ...fixos,
                WARAOS: v === '' ? undefined : parseQty(v),
              });
            }}
          />
        </label>
        <label>
          Mãos Dadas (real)
          <input
            type="text"
            inputMode="numeric"
            disabled={readOnly}
            placeholder="40"
            value={fixos['MÃOS DADAS'] != null ? String(fixos['MÃOS DADAS']) : ''}
            onChange={(e) => {
              const v = e.target.value.trim();
              patch(mon.perdaAjuste ?? null, {
                ...fixos,
                'MÃOS DADAS': v === '' ? undefined : parseQty(v),
              });
            }}
          />
        </label>
      </div>
      <p className="hint">
        Referência padrão: {UNIDADE_SAICA} 25 · {UNIDADE_WARAOS} 29 ·{' '}
        {UNIDADE_MAOS_DADAS} 40. Deixe vazio para usar o padrão.
      </p>
    </section>
  );
}
