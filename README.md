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

## Deploy (Render)

[`render.yaml`](render.yaml) define o serviço: **New → Blueprint** → este repositório.
O Render pede os segredos (`sync: false`) na criação e só publica quando o CI passa.
