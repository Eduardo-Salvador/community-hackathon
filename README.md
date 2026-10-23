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

- **`VOICE_MODEL`** (voz do site): o padrão `gpt-realtime` ainda não foi validado com chave real. Confirme no painel da OpenAI o nome do modelo Realtime da conta e ajuste a variável. Sem isso, `POST /voice/token` pode responder `502 VOICE_UPSTREAM_ERROR`.
- **Portal Senatran**: as rotas (`#/infracoes/consultar`, `#/veiculos/meus-veiculos`, `#/habilitacao/consultar`) vêm do catálogo oficial do portal e já são o padrão. Os textos/telas internas ainda precisam ser validados no primeiro login real.

## Deploy (Render)

[`render.yaml`](render.yaml) define o serviço: **New → Blueprint** → este repositório.
O Render pede os segredos (`sync: false`) na criação e só publica quando o CI passa.
