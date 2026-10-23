# community-hackathon

Assistente de serviços do DETRAN por voz e chat.

| Pasta | O que é |
|---|---|
| [`backend/`](backend) | API Node/TypeScript (Fastify): sessão, voz, login gov.br, CNH, multas, veículo, MCP. Swagger em `/docs`. |
| `frontend/` | Site (time de frontend). |

## Backend

```bash
cd backend
npm install
npm run dev     # http://localhost:3000 (MOCK=1 por padrão)
npm test
npm run smoke   # roda o fluxo completo contra o servidor no ar
```

Variáveis: veja [`backend/.env.example`](backend/.env.example).

## Pendências de configuração

- **`VOICE_MODEL`** (voz do site): `gpt-realtime-2.1-mini`, o modelo Realtime mais barato com function calling (US$ 0,60/2,40 texto e US$ 10/20 áudio por 1M tokens). Exige conta paga na OpenAI (tier Build ou acima; o Free não tem acesso). Ainda não validado com chave real: se `POST /voice/token` responder `502 VOICE_UPSTREAM_ERROR`, confira o acesso ao modelo na conta.
- **Guia de pagamento**: gerada no próprio portal da Senatran (boleto/Pix oficial do SNE) com o login gov.br, sem provedor de pagamento. A tela de pagamento ainda precisa ser validada com login real; até lá, `GUIA_DEMO=1` devolve uma guia marcada como demonstração (`demonstracao: true`, "NÃO PAGUE" no texto e no PDF).
- **Portal Senatran**: as rotas (`#/infracoes/consultar`, `#/veiculos/meus-veiculos`, `#/habilitacao/consultar`) vêm do catálogo oficial do portal e já são o padrão. Os textos/telas internas ainda precisam ser validados no primeiro login real.

## Deploy (Render)

[`render.yaml`](render.yaml) define o serviço: **New → Blueprint** → este repositório.
O Render pede os segredos (`sync: false`) na criação e só publica quando o CI passa.
