import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hydrateDashboardState } from '../shared/buildDashboard.js';
import { recalculateSnapshot } from '../shared/recalculateSnapshot.js';
import { listMethodologyTable } from '../shared/methodologyCalendar.js';
import { rawRowsFromPayload } from '../shared/syncFromServices.js';
import type { DashboardState } from '../shared/types.js';
import { allocatePlans } from '../shared/allocation.js';
import { mergeServiceDefs, mergeServiceHistory } from '../shared/mergeServices.js';
import { normalizeServicesPayload } from '../shared/payloadNormalize.js';
import type { ServicesPayload } from '../shared/serviceTypes.js';
import {
  clearDashboard,
  getDashboard,
  getPool,
  listImports,
  saveDashboard,
} from './db.js';
import { runMigrations } from './migrate.js';
import {
  clearServicesData,
  getServicesData,
  saveServicesData,
} from './servicesDb.js';
import { mergeAppSettings } from '../shared/appSettings.js';
import { requireAdminWrite } from './adminAuth.js';
import { persistAndRecalculate } from './recalculate.js';
import type { AppSettings } from '../shared/appSettings.js';

const ADMIN_PATH = (process.env.ADMIN_PATH || '/admin').replace(/\/$/, '') || '/admin';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(
  process.env.PORT ?? (process.env.NODE_ENV === 'production' ? 80 : 3000),
);
// dist-server/server/index.js → frontend em /app/dist
const distPath = join(__dirname, '../../dist');

async function start() {
  if (!process.env.DATABASE_URL) {
    console.error('ERRO: defina DATABASE_URL no ambiente do EasyPanel.');
    process.exit(1);
  }

  const pool = getPool();
  console.log('[startup] Executando migrations…');
  await runMigrations(pool);
  console.log('[startup] Migrations concluídas.');

  const indexHtml = join(distPath, 'index.html');
  if (!existsSync(indexHtml)) {
    console.error(`[startup] Frontend não encontrado: ${indexHtml}`);
    process.exit(1);
  }
  console.log(`[startup] Frontend: ${distPath}`);

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/config', (_req, res) => {
    res.json({
      adminPath: ADMIN_PATH,
      requiresAdminKey: Boolean(process.env.ADMIN_API_KEY?.trim()),
      readOnlyHint:
        'A rota pública exibe dados sem permitir importar ou alterar a base.',
    });
  });

  app.get('/api/admin/check', requireAdminWrite, (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/health', async (_req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ ok: true, database: 'connected' });
    } catch (e) {
      res.status(503).json({
        ok: false,
        database: 'error',
        message: e instanceof Error ? e.message : 'Erro DB',
      });
    }
  });

  app.get('/api/snapshot', async (_req, res) => {
    try {
      const payload = await getServicesData();
      let snapshot = recalculateSnapshot(payload);
      const stored = await getDashboard();
      if (stored.state && !snapshot.state) {
        snapshot = { state: stored.state, saldoEstoque: stored.saldoAtual };
      } else if (snapshot.state) {
        const hydrated = hydrateDashboardState(
          snapshot.state,
          snapshot.saldoEstoque,
          payload.settings?.contratoMensal ?? 1500,
        );
        snapshot = { state: hydrated, saldoEstoque: snapshot.saldoEstoque };
      }
      const methodologyTable = payload.history.length
        ? listMethodologyTable(
            rawRowsFromPayload(payload),
            payload.settings?.methodology ?? {
              overrides: {},
              excludeYear2023: true,
              exclude2022Q1: true,
              janelaMediaMeses: 8,
            },
          )
        : [];
      res.json({
        payload,
        snapshot,
        methodologyTable,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.get('/api/dashboard', async (_req, res) => {
    try {
      const data = await getDashboard();
      if (data.state) {
        const hydrated = hydrateDashboardState(data.state, data.saldoAtual);
        if (hydrated !== data.state) {
          await saveDashboard(hydrated, data.saldoAtual);
        }
        res.json({ state: hydrated, saldoAtual: data.saldoAtual });
        return;
      }
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.put('/api/dashboard', requireAdminWrite, async (req, res) => {
    try {
      const { state, saldoAtual } = req.body as {
        state: DashboardState;
        saldoAtual?: number | null;
      };
      if (!state?.rows) {
        res.status(400).json({ error: 'state inválido' });
        return;
      }
      const saldo =
        saldoAtual === undefined || saldoAtual === null
          ? null
          : Number(saldoAtual);
      await saveDashboard(state, Number.isNaN(saldo) ? null : saldo);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.post('/api/dashboard/sync-from-services', requireAdminWrite, async (_req, res) => {
    try {
      const servicesData = await getServicesData();
      if (!servicesData.history.length) {
        res.status(400).json({
          error: 'Importe a planilha por equipamento antes de sincronizar.',
        });
        return;
      }
      const { snapshot } = await persistAndRecalculate(servicesData);
      res.json({
        state: snapshot.state,
        saldoAtual: snapshot.saldoEstoque,
      });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.post('/api/imports', requireAdminWrite, (_req, res) => {
    res.status(410).json({
      error:
        'Importação Mês+Total descontinuada. Use /admin → Importar e validar (planilha por equipamento).',
    });
  });

  app.delete('/api/dashboard', requireAdminWrite, async (_req, res) => {
    try {
      await clearDashboard();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.get('/api/imports', async (_req, res) => {
    try {
      const items = await listImports();
      res.json({ items });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.get('/api/services', async (_req, res) => {
    try {
      const data = await getServicesData();
      res.json(data);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.put('/api/services', requireAdminWrite, async (req, res) => {
    try {
      const body = req.body as Partial<ServicesPayload> &
        Pick<ServicesPayload, 'services' | 'history'>;
      if (!Array.isArray(body.services) || !Array.isArray(body.history)) {
        res.status(400).json({ error: 'payload inválido' });
        return;
      }
      const { payload } = await persistAndRecalculate(body);
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.post('/api/services/import', requireAdminWrite, async (req, res) => {
    try {
      const body = req.body as Partial<ServicesPayload> &
        Pick<ServicesPayload, 'services' | 'history'> & { merge?: boolean };
      if (!Array.isArray(body.history) || !Array.isArray(body.services)) {
        res.status(400).json({ error: 'history e services obrigatórios' });
        return;
      }
      const existing = await getServicesData();
      const merge = body.merge !== false;
      const history = merge
        ? mergeServiceHistory(existing.history, body.history)
        : body.history;
      const services = merge
        ? mergeServiceDefs(existing.services, body.services)
        : body.services;
      const { payload } = await persistAndRecalculate({
        services,
        history,
        emergencial: body.emergencial ?? existing.emergencial,
        regular: body.regular ?? existing.regular,
        plans: body.plans,
        meta: body.meta ?? existing.meta,
        settings: body.settings ?? existing.settings,
      });
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.post('/api/services/allocate', async (req, res) => {
    try {
      const body = req.body as Partial<ServicesPayload>;
      const raw =
        body.services?.length && body.history?.length
          ? body
          : await getServicesData();
      const data = normalizeServicesPayload({
        services: raw.services ?? [],
        history: raw.history ?? [],
        emergencial: raw.emergencial,
        regular: raw.regular,
        plans: raw.plans,
      });
      const plans = data.emergencial.plans?.length
        ? data.emergencial.plans
        : data.plans;
      if (!data.services.length || !data.history.length) {
        res.status(400).json({ error: 'Importe o histórico por serviço antes.' });
        return;
      }
      if (!plans.length) {
        res.status(400).json({ error: 'Informe as metas do processo emergencial.' });
        return;
      }
      const results = allocatePlans(plans, data.services, data.history);
      res.json({ results });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.put('/api/settings', requireAdminWrite, async (req, res) => {
    try {
      const existing = await getServicesData();
      const body = req.body as Partial<AppSettings>;
      const { payload } = await persistAndRecalculate({
        ...existing,
        settings: mergeAppSettings({ ...existing.settings, ...body }),
      });
      res.json(payload);
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.delete('/api/services', requireAdminWrite, async (_req, res) => {
    try {
      await clearServicesData();
      await clearDashboard();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : 'Erro' });
    }
  });

  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(join(distPath, 'index.html'));
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[server] http://0.0.0.0:${PORT}`);
  });
}

start().catch((err) => {
  console.error('[startup] Falha:', err);
  process.exit(1);
});
