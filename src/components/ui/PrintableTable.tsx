import { useCallback, useId, useRef, type ReactNode } from 'react';
import { FileSpreadsheet, Printer } from 'lucide-react';
import { exportTableToExcel } from '../../lib/exportTableExcel';
import { openPrintTableDocument } from '../../lib/printTableDocument';
import './PrintableTable.css';

export interface PrintableTableProps {
  /** Título no relatório impresso e na barra da tabela */
  title: string;
  subtitle?: string;
  /** Nome do arquivo .xlsx (sem extensão) */
  exportFileName?: string;
  /** Legenda (cores, siglas) — incluída na impressão */
  legend?: ReactNode;
  orientation?: 'landscape' | 'portrait';
  wrapClassName?: string;
  className?: string;
  extraPrintCss?: string;
  children: ReactNode;
}

export default function PrintableTable({
  title,
  subtitle,
  exportFileName,
  legend,
  orientation = 'landscape',
  wrapClassName = '',
  className = '',
  extraPrintCss,
  children,
}: PrintableTableProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const handlePrint = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;

    const table = root.querySelector('table');
    if (!table) return;

    const ok = openPrintTableDocument({
      title,
      subtitle,
      tableHtml: table.outerHTML,
      legendHtml: legendRef.current?.innerHTML,
      orientation,
      extraCss: extraPrintCss,
    });

    if (!ok) {
      window.alert('Não foi possível iniciar a impressão. Tente novamente.');
    }
  }, [title, subtitle, orientation, extraPrintCss]);

  const handleExportExcel = useCallback(() => {
    const root = contentRef.current;
    if (!root) return;

    const table = root.querySelector('table');
    if (!table) return;

    const ok = exportTableToExcel({
      table,
      title,
      subtitle,
      fileName: exportFileName,
    });

    if (!ok) {
      window.alert('Não foi possível exportar a tabela para Excel.');
    }
  }, [title, subtitle, exportFileName]);

  return (
    <div className={`printable-table ${className}`.trim()}>
      <div className="printable-table__toolbar">
        <div className="printable-table__headings">
          <h4 id={titleId} className="printable-table__title">
            {title}
          </h4>
          {subtitle ? <p className="printable-table__subtitle">{subtitle}</p> : null}
        </div>
        <div className="printable-table__actions">
          <button
            type="button"
            className="printable-table__btn printable-table__btn--excel"
            onClick={handleExportExcel}
            aria-labelledby={titleId}
            title={`Exportar Excel: ${title}`}
          >
            <FileSpreadsheet size={15} aria-hidden />
            Exportar Excel
          </button>
          <button
            type="button"
            className="printable-table__btn"
            onClick={handlePrint}
            aria-labelledby={titleId}
            title={`Imprimir: ${title}`}
          >
            <Printer size={15} aria-hidden />
            Imprimir
          </button>
        </div>
      </div>

      {legend ? (
        <div ref={legendRef} className="printable-table__legend-slot">
          {legend}
        </div>
      ) : null}

      <div
        ref={contentRef}
        className={`table-wrap ${wrapClassName}`.trim()}
      >
        {children}
      </div>
    </div>
  );
}
