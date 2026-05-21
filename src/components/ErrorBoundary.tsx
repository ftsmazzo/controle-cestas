import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  title?: string;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <section className="panel error-boundary">
          <h2>{this.props.title ?? 'Algo deu errado nesta tela'}</h2>
          <p className="error">{this.state.error.message}</p>
          <p className="hint">
            Tente recarregar a página (Ctrl+F5). Se persistir, limpe os dados em Equipamentos
            e importe a planilha de novo.
          </p>
          <button
            type="button"
            className="primary-btn"
            onClick={() => {
              this.setState({ error: null });
              window.location.reload();
            }}
          >
            Recarregar página
          </button>
        </section>
      );
    }
    return this.props.children;
  }
}
