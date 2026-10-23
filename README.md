# community-hackathon

Assistente de serviços do DETRAN por voz e chat.

| Pasta | O que é |
|---|---|
| [`backend/`](backend) | API Node/TypeScript (Fastify): sessão, voz, login gov.br, CNH, multas, veículo, MCP. Swagger em `/docs`. |
| [`frontend/`](frontend) | Site React/Vite: conversa por texto e voz, cards de CNH, multas, Pix e veículo. |

## Backend

```bash
cd backend
npm install
npm run dev     # http://localhost:3000 (MOCK=1 por padrão)
npm test
npm run smoke   # roda o fluxo completo contra o servidor no ar
```

Variáveis: veja [`backend/.env.example`](backend/.env.example).

## Frontend

```bash
cd frontend
npm install
npm run dev       # http://localhost:5173, com proxy para o backend em localhost:3000
npm run dev:mock  # sem backend: mock do contrato dentro do navegador
npm test
npm run build
```

Variáveis: veja [`frontend/.env.example`](frontend/.env.example). Em produção, `VITE_API_URL` aponta para o backend
e o `CORS_ORIGIN` do backend aponta para o site.

## Pendências de configuração

- **`VOICE_MODEL`** (voz do site): o padrão `gpt-realtime` ainda não foi validado com chave real. Confirme no painel da OpenAI o nome do modelo Realtime da conta e ajuste a variável. Sem isso, `POST /voice/token` pode responder `502 VOICE_UPSTREAM_ERROR`.
- **Guia de pagamento**: gerada no próprio portal da Senatran (boleto/Pix oficial do SNE) com o login gov.br, sem provedor de pagamento. A tela de pagamento ainda precisa ser validada com login real; até lá, `GUIA_DEMO=1` devolve uma guia marcada como demonstração (`demonstracao: true`, "NÃO PAGUE" no texto e no PDF).
- **Portal Senatran**: as rotas (`#/infracoes/consultar`, `#/veiculos/meus-veiculos`, `#/habilitacao/consultar`) vêm do catálogo oficial do portal e já são o padrão. Os textos/telas internas ainda precisam ser validados no primeiro login real.

## Deploy (Render)

[`render.yaml`](render.yaml) define os serviços (backend e site estático): **New → Blueprint** → este repositório.
Depois do primeiro deploy, preencha `VITE_API_URL` no site e `CORS_ORIGIN`/`PUBLIC_URL` no backend com as URLs geradas.
O Render pede os segredos (`sync: false`) na criação e só publica quando o CI passa.
