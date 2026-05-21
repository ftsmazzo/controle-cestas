# Controle de Cestas Básicas

Dashboard web com metodologia da nota técnica (abr/2025–mai/2026), API Node, **PostgreSQL** e migrations automáticas na implantação (sem rodar SQL manual no terminal).

Repositório: [github.com/ftsmazzo/controle-cestas](https://github.com/ftsmazzo/controle-cestas)

## Desenvolvimento local

1. Copie `.env.example` para `.env` e ajuste `DATABASE_URL`.
2. `npm install`
3. `npm run dev` — frontend em `:5173` (proxy `/api` → `:3000`) e API com `tsx`.

## Deploy no EasyPanel

### 1. PostgreSQL

Crie o banco (ex.: `controle_cestas`) no serviço Postgres do EasyPanel. Anote host interno, usuário, senha e porta.

### 2. App (Dockerfile)

| Campo | Valor |
|-------|--------|
| Repositório | `https://github.com/ftsmazzo/controle-cestas` |
| Build | **Dockerfile** |
| Porta do container | **80** |

### 3. Variáveis de ambiente (obrigatórias)

| Variável | Obrigatória | Exemplo | Descrição |
|----------|-------------|---------|-----------|
| `DATABASE_URL` | **Sim** | `postgresql://user:pass@postgres:5432/controle_cestas` | Conexão PostgreSQL. No EasyPanel use o **hostname interno** do serviço Postgres. |
| `PORT` | Recomendado | `80` | Porta HTTP do Node (já definida no Dockerfile). |
| `NODE_ENV` | Recomendado | `production` | Ambiente de produção. |
| `PGSSLMODE` | Não | `require` | Só se o Postgres exigir SSL. |

**Montagem da `DATABASE_URL` no EasyPanel:**

```
postgresql://USUARIO:SENHA@HOST_INTERNO_POSTGRES:5432/NOME_DO_BANCO
```

Substitua `HOST_INTERNO_POSTGRES` pelo nome do serviço Postgres na mesma stack (ex.: `postgres`, `controle-cestas-db`).

### 4. Migrations

Executadas **automaticamente** cada vez que o container sobe (`server/migrate.ts` no startup). Não é necessário SSH nem terminal para criar tabelas.

### 5. Teste após deploy

- `https://SEU-DOMINIO/api/health` → `{"ok":true,"database":"connected"}`
- Abra o site, importe planilha ou “Carregar exemplo”
- Badge **PostgreSQL conectado** no canto superior

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Saúde + conexão DB |
| GET | `/api/dashboard` | Estado atual + saldo |
| PUT | `/api/dashboard` | Atualiza dashboard/saldo |
| POST | `/api/imports` | Importa linhas mensais (JSON) |
| DELETE | `/api/dashboard` | Limpa dados |
| GET | `/api/imports` | Histórico de uploads |

## Planilha Excel

Colunas: **Mês**, **Total** (obrigatórios); **Status**, **Observação** (opcionais).

## Estrutura

- `shared/` — cálculos e tipos (frontend + API)
- `server/` — Express, PostgreSQL, migrations
- `src/` — React dashboard
