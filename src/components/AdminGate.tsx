import { useEffect, useState, type ReactNode } from 'react';
import { apiFetch, getAdminKey, setAdminKey } from '../lib/http';
import './AdminGate.css';

interface Props {
  children: ReactNode;
}

export default function AdminGate({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const [requiresKey, setRequiresKey] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/config');
        const cfg = (await res.json()) as { requiresAdminKey?: boolean };
        if (cancelled) return;
        const need = cfg.requiresAdminKey === true;
        setRequiresKey(need);
        if (!need || getAdminKey()) setUnlocked(true);
      } catch {
        if (!cancelled) setUnlocked(true);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tryUnlock = async () => {
    setError(null);
    setAdminKey(input);
    try {
      const res = await apiFetch('/api/admin/check');
      if (!res.ok) throw new Error('Chave recusada pelo servidor.');
      setUnlocked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chave inválida.');
      setUnlocked(false);
    }
  };

  if (checking) {
    return (
      <div className="admin-gate">
        <p>Verificando acesso administrativo…</p>
      </div>
    );
  }

  if (requiresKey && !unlocked) {
    return (
      <div className="admin-gate panel">
        <h2>Área administrativa</h2>
        <p className="hint">
          Informe a chave definida no servidor (<code>ADMIN_API_KEY</code> no EasyPanel).
        </p>
        <label>
          Chave de administrador
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void tryUnlock()}
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button type="button" className="primary-btn" onClick={() => void tryUnlock()}>
          Entrar
        </button>
        <p className="hint">
          <a href="/">Voltar ao painel de consulta (somente leitura)</a>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
