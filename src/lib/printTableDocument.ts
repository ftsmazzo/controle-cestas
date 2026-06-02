/** Estilos embutidos na janela de impressão (tabelas do app) */
export const PRINT_TABLE_BASE_CSS = `
  @page { margin: 14mm 12mm; size: A4 landscape; }
  @page portrait { size: A4 portrait; margin: 14mm 12mm; }

  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: 'Segoe UI', system-ui, sans-serif;
    font-size: 10pt;
    color: #0f172a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  .print-doc {
    max-width: 100%;
  }

  .print-doc__brand {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
    padding-bottom: 0.65rem;
    margin-bottom: 0.75rem;
    border-bottom: 3px solid #4f46e5;
  }

  .print-doc__org {
    font-size: 9pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #4f46e5;
    margin: 0 0 0.15rem;
  }

  .print-doc__app {
    margin: 0;
    font-size: 14pt;
    font-weight: 800;
    letter-spacing: -0.02em;
    color: #0f172a;
  }

  .print-doc__meta {
    text-align: right;
    font-size: 8.5pt;
    color: #64748b;
    line-height: 1.45;
  }

  .print-doc__meta strong { color: #0f172a; display: block; font-size: 9pt; }

  .print-doc__title {
    margin: 0 0 0.25rem;
    font-size: 12pt;
    font-weight: 700;
  }

  .print-doc__subtitle {
    margin: 0 0 0.65rem;
    font-size: 9pt;
    color: #64748b;
    line-height: 1.4;
  }

  .print-doc__legend {
    margin: 0 0 0.5rem;
    padding: 0.4rem 0.55rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 6px;
    font-size: 8.5pt;
    color: #475569;
    line-height: 1.5;
  }

  .print-doc__legend span { margin-right: 1rem; }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 8.5pt;
    page-break-inside: auto;
  }

  tr { page-break-inside: avoid; page-break-after: auto; }
  thead { display: table-header-group; }

  th, td {
    border: 1px solid #cbd5e1;
    padding: 0.35rem 0.45rem;
    text-align: left;
    vertical-align: top;
  }

  th {
    background: #f1f5f9 !important;
    font-weight: 700;
    color: #334155;
    white-space: nowrap;
  }

  tbody tr:nth-child(even) td { background: #fafbfc; }

  .row-excluir td { background: #f8fafc !important; color: #64748b; }
  .row-ruptura td { background: #fef2f2 !important; }
  .row-parcial td { background: #fffbeb !important; }

  .csem-cell--cota { background: #fef9c3 !important; }
  .csem-cell--media { background: #ffedd5 !important; }
  .csem-cell--ambos { background: #fecaca !important; }
  .csem-cell--zero { color: #94a3b8; }

  .cessao-row-familia td { background: #eef2ff !important; font-weight: 600; }
  .cessao-row-unidade td:first-child { padding-left: 1rem; }

  .mit-impacto-forte td { background: #fef2f2 !important; }
  .mit-impacto-moderado td { background: #fffbeb !important; }

  .heatmap-row-label { font-weight: 600; background: #f8fafc !important; }
  .heatmap-cell { text-align: center; }

  .print-doc__footer {
    margin-top: 0.75rem;
    padding-top: 0.5rem;
    border-top: 1px solid #e2e8f0;
    font-size: 7.5pt;
    color: #94a3b8;
    text-align: center;
  }
`;

export interface PrintTableDocumentOptions {
  title: string;
  subtitle?: string;
  tableHtml: string;
  legendHtml?: string;
  orientation?: 'landscape' | 'portrait';
  extraCss?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openPrintTableDocument(options: PrintTableDocumentOptions): boolean {
  const {
    title,
    subtitle,
    tableHtml,
    legendHtml,
    orientation = 'landscape',
    extraCss = '',
  } = options;

  const win = window.open('', '_blank', 'noopener,noreferrer');
  if (!win) {
    return false;
  }

  const now = new Date().toLocaleString('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  });
  const pageRule =
    orientation === 'portrait' ? '@page { size: A4 portrait; margin: 14mm 12mm; }' : '';

  const doc = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)} — Controle de Cestas</title>
  <style>
    ${pageRule}
    ${PRINT_TABLE_BASE_CSS}
    ${extraCss}
  </style>
</head>
<body>
  <div class="print-doc">
    <header class="print-doc__brand">
      <div>
        <p class="print-doc__org">SEMAS · Controle de Cestas</p>
        <h1 class="print-doc__app">Relatório tabular</h1>
      </div>
      <div class="print-doc__meta">
        <strong>Impresso em</strong>
        ${escapeHtml(now)}
      </div>
    </header>
    <h2 class="print-doc__title">${escapeHtml(title)}</h2>
    ${subtitle ? `<p class="print-doc__subtitle">${escapeHtml(subtitle)}</p>` : ''}
    ${legendHtml ? `<div class="print-doc__legend">${legendHtml}</div>` : ''}
    ${tableHtml}
    <p class="print-doc__footer">Documento gerado pelo Dashboard de Cestas Básicas — uso interno SEMAS</p>
  </div>
  <script>
    window.onload = function() {
      window.focus();
      window.print();
    };
  </script>
</body>
</html>`;

  win.document.open();
  win.document.write(doc);
  win.document.close();
  return true;
}
