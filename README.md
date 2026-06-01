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

## Monitor emergencial (produção semanal)

O Banco de Alimentos registra em **/admin/monitoramento** (área administrativa):

- **Saldo** atual de cestas no almoxarifado
- **Envios semanais por equipamento** (CRAS 1, CREAS II, SAICA…), no formato das planilhas em `Docs/` (4–5 semanas por mês)

A consulta pública em **Monitor emergencial** exibe ritmo vs. meta, alertas de ruptura e metas por equipamento derivadas da **distribuição projetada** do processo emergencial (não agrega só “CRAS”).

Semanas civis: 1–7, 8–14, 15–21, 22–28, 29–fim do mês.

**Granularidade:** CRAS e CREAS são *famílias*; o monitoramento opera nas *unidades* (CRAS 1…12, CREAS I…V). Saldo é registrado semana a semana (`historicoSaldo`).

**Import PDF Coderp:** em `/admin/monitoramento`, envie o relatório RME “Consumo por requisitante” — o sistema mapeia SETOR CRAS1, CREAS II, etc. para as unidades e preenche o monitoramento (opcional: atualizar histórico mensal).

## Por serviço (distribuição)

Aba **Por serviço** no dashboard:

1. Importe planilha com consumo histórico **por serviço**
2. Marque serviços **fixos** e opcionalmente **cota fixa** (cestas/mês)
3. Informe o total disponível para cada um dos **próximos meses** (ex.: 1.150 em Jun/2026)
4. **Calcular distribuição** — reserva fixos primeiro; o restante divide pelos demais conforme % do histórico

### Formatos de planilha aceitos

**Pivot institucional** (principal — igual à sua planilha):

| Equipamento | Jan | Fev | Mar | … | Dez |
|-------------|-----|-----|-----|---|-----|
| CRAS | 1200 | 1100 | … | | |
| CREAS | 280 | … | | | |
| SAICA | 40 | 40 | … | | |

Defina o **ano** na tela (ex.: 2025) quando as colunas forem só Jan, Fev…  
Subdivisões **CRAS 1**, **CRAS 2**, **CREAS 1**… = uma linha por equipamento.

**Longo**:

| Mês | Serviço | Total | Fixo |
|-----|---------|-------|------|
| Jun/2025 | CRAS Centro | 320 | Sim |

**Largo** (coluna Mês + um serviço por coluna):

| Mês | CRAS | CREAS | SAICA |
|-----|------|-------|-------|

## API

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/health` | Saúde + conexão DB |
| GET | `/api/dashboard` | Estado atual + saldo |
| PUT | `/api/dashboard` | Atualiza dashboard/saldo |
| POST | `/api/imports` | Importa linhas mensais (JSON) |
| DELETE | `/api/dashboard` | Limpa dados |
| GET | `/api/imports` | Histórico de uploads |
| GET | `/api/services` | Dados por serviço |
| PUT | `/api/services` | Salva serviços/planos |
| POST | `/api/services/import` | Importa histórico por serviço |
| POST | `/api/services/allocate` | Calcula distribuição |
| DELETE | `/api/services` | Limpa dados por serviço |

## Planilha Excel

Colunas: **Mês**, **Total** (obrigatórios); **Status**, **Observação** (opcionais).

## Estrutura

- `shared/` — cálculos e tipos (frontend + API)
- `server/` — Express, PostgreSQL, migrations
- `src/` — React dashboard
