# Dashboard de Consumo de Cestas Básicas

Sistema web que replica a metodologia da nota técnica (abr/2025–mai/2026): importação de planilhas Excel, tratamento de meses completos/ruptura/parcial, KPIs, anomalias, forecast linear e simulação do contrato de 18.000 cestas.

## Como usar

```bash
npm install
npm run dev
```

Abra o endereço exibido no terminal (geralmente `http://localhost:5173`).

1. **Importar** o arquivo `Levantamento Cestas Básicas (abril25 a mai26).xlsx` (ou equivalente).
2. Informar **saldo atual** para calcular autonomia e faixa de risco (Verde/Amarelo/Vermelho).
3. Conferir tabela derivada, gráficos e cenários do contrato.

## Formato esperado da planilha

| Coluna (cabeçalho) | Obrigatório | Exemplos de nome |
|--------------------|-------------|------------------|
| Mês                | Sim         | Mês, Competência |
| Total              | Sim         | Total, Consumo   |
| Status             | Não         | Completo, Ruptura de estoque, Parcial |
| Observação         | Não         | Justificativa operacional |

A aba pode chamar-se `base`, `dados`, `histórico` ou ser a primeira aba do arquivo.

## Fórmulas implementadas

Equivalentes às fórmulas Excel da nota técnica:

- Variação M/M, média móvel 3 meses, total ajustado, uso no modelo
- Flag de anomalia (3 níveis: Normal, Atenção, Anomalia, Excluir modelo)
- KPIs: soma observada/válida, média, pico, mínimo válido, DESVPAD.P
- Autonomia = Saldo / média válida; risco por faixas (>4, 2–4, <2 meses)
- PREVISÃO.LINEAR / TENDÊNCIA para +3 meses (somente meses completos)
- Simulação 18.000 cestas para consumos 1.500–2.000/mês

Os dados ficam salvos no **localStorage** do navegador entre sessões.

## Deploy no EasyPanel (Docker)

1. Crie um **App** apontando para este repositório: [ftsmazzo/controle-cestas](https://github.com/ftsmazzo/controle-cestas)
2. Método de build: **Dockerfile** (porta **80**)
3. PostgreSQL: use quando houver API/backend; o frontend atual persiste no navegador (`localStorage`)

Variáveis de ambiente futuras (API): `DATABASE_URL`, etc.

## Próximos passos (opcional)

- API Node + PostgreSQL para histórico persistente
- Leitura do PDF complementar (OCR ou extração tabular)
- Exportação da base processada para Excel
