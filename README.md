# Assistente DETRAN — resolva sua vida no trânsito conversando

**🔗 Acesse:** **https://community-hackathon-sigma.vercel.app**
API (Swagger): https://community-hackathon-backend.onrender.com/docs

> O backend roda no plano gratuito do Render: o primeiro acesso pode levar até 1 minuto para "acordar".

---

## O problema

Consultar a CNH, descobrir quantos pontos você tem, achar a multa e gerar o boleto com desconto, saber se o carro tem recall ou IPVA atrasado… Tudo isso existe, mas espalhado entre o portal da Senatran, o DETRAN de cada estado, a Sefaz e apps diferentes, com menus confusos e linguagem técnica. Para muita gente — idosos, pessoas com pouca familiaridade digital ou com deficiência visual — isso é uma barreira real.

## A solução

Um **assistente por voz e chat** que faz isso pelo usuário. A pessoa fala do jeito dela — *"minha CNH tá vencendo?"*, *"tenho multa?"*, *"gera o Pix da multa"* — e o agente:

1. pergunta o estado (UF);
2. abre o **login oficial do gov.br** numa janela segura, onde o próprio usuário entra (senha, 2FA e captcha ficam com ele — **nunca vemos a senha**);
3. navega no **Portal de Serviços da Senatran** por ele, lê as telas e devolve tudo em linguagem simples;
4. mostra cada etapa ao vivo na tela, para o usuário saber o que está acontecendo.

### O que dá para fazer

| Serviço | O que o usuário recebe |
|---|---|
| **CNH** | Validade, categoria e situação, com o **PDF da CNH digital** (ou comprovante) |
| **Multas e pontos** | Lista de multas, **pontos na carteira com alerta** (verde/amarelo/vermelho conforme o limite de 20/30/40), data em que cada multa sai da contagem e prazo do desconto SNE |
| **Guia de pagamento** | **Boleto/Pix oficial do SNE** (com até 40% de desconto quando houver), com QR Code, "copiar código" e PDF |
| **Veículos** | Licenciamento, IPVA, restrições, **recall** e CRLV-e |
| **Exame toxicológico** | Prazo do próximo exame (CNH C, D e E) |
| **Compartilhar** | Link temporário (15 min) + mensagem pronta para **WhatsApp e e-mail**; no celular, abre direto o app do banco com o código copiado |

E o mesmo assistente funciona dentro do **dots da OpenAI** (agente pessoal), pelo nosso servidor **MCP**.

---

## Como funciona

```
           Usuário (voz ou texto)                       dots (OpenAI)
                   │                                          │
        Site React (Vercel) ── WebRTC ──► OpenAI Realtime     │ MCP
                   │   ▲                  (voz + tool calls)  │
                   │   └── WebSocket: etapas ao vivo          │
                   ▼                                          ▼
         ┌──────────────── Backend Node/TypeScript (Render) ───────────────┐
         │  Sessão segura · Orquestrador · Registry único de tools          │
         │     │                    │                       │               │
         │  OpenAI Decisions     Browserbase            Infosimples         │
         │  (próximo passo)      (navegador remoto:     (recall e exame     │
         │                        login gov.br +         toxicológico,      │
         │  GPT-6 Astra           Portal Senatran)       sem senha)         │
         │  (lê as telas)                                                    │
         └───────────────────────────────────────────────────────────────────┘
```

- **Voz:** OpenAI Realtime (`gpt-realtime-2.1-mini`) conversa com o usuário e chama as nossas *tools*.
- **Orquestrador:** a **OpenAI Decisions API** sugere o próximo passo da conversa; regras fixas garantem que UF e login nunca são pulados.
- **Navegador remoto:** a **Browserbase** abre o portal oficial; o usuário faz o login gov.br ali, ao vivo.
- **Leitura das telas:** o **GPT-6 Astra** transforma o texto do portal em dados estruturados, validados contra o nosso contrato.
- **Um só backend para tudo:** o site, a voz e o dots usam exatamente as mesmas tools.

### Segurança e privacidade (LGPD)

- A senha do gov.br **nunca passa pelo nosso sistema**: o login é feito pelo próprio usuário na tela oficial.
- **Nada é gravado**: sem banco de dados; sessão, documentos e navegador são apagados quando a conversa termina (30 min sem uso).
- Navegador remoto **sem gravação e sem logs**; a OpenAI é chamada com `store: false`.
- Tudo que vem de sites externos é tratado como **dado não confiável** (proteção contra *prompt injection*) e validado antes de ser usado.
- Downloads só de domínios `*.gov.br`; links de compartilhamento expiram em 15 minutos.
- Ações sensíveis (gerar guia de pagamento) **sempre pedem confirmação** do usuário.
- Pagamento sempre pelo **canal oficial** (guia do SNE): o dinheiro vai direto para o órgão, sem intermediários nem taxas.

---

## Como construímos

Time dividido em **backend (2 devs)** e **frontend**, trabalhando em paralelo a partir de um **contrato de API** definido no primeiro dia.

1. **Fundação** — monorepo TypeScript, contratos em Zod (que geram o Swagger automaticamente) e todos os serviços em *mock*, para o frontend começar no mesmo dia.
2. **Voz** — token temporário da OpenAI Realtime gerado no backend (as chaves nunca vão para o navegador).
3. **Orquestrador** — pré-requisitos determinísticos + OpenAI Decisions API para sugerir o próximo passo.
4. **Login gov.br real** — Browserbase com *live view*; descobrimos as rotas reais a partir do catálogo público do próprio portal da Senatran.
5. **CNH, multas, veículos e guia** — extração das telas com GPT-6 Astra; cálculo de pontos e desconto SNE no nosso domínio.
6. **MCP para o dots** — as mesmas tools expostas como servidor MCP.
7. **Compartilhamento** — links temporários, textos prontos e QR Code do Pix.
8. **Qualidade** — **80+ testes automatizados**, *smoke test* do fluxo completo e **CI no GitHub Actions** a cada push; o Render só publica quando o CI passa.

Decisões que mudaram no caminho (e por quê):
- **Zapay → guia oficial do portal:** a Zapay não tem API aberta; a guia do SNE é oficial, sem taxa e com o desconto real.
- **Sem pedir senha a terceiros:** consultas de terceiros que exigiriam a senha gov.br do usuário foram descartadas; só usamos as que não pedem senha.

### Tecnologias

TypeScript · Node 22 · Fastify · Zod · React + Vite · OpenAI (Realtime, Decisions API, GPT-6 Astra) · Browserbase + Playwright · Model Context Protocol (MCP) · Infosimples · Render · Vercel · GitHub Actions

---

## Rodando localmente

| Pasta | O que é |
|---|---|
| [`backend/`](backend) | API: sessão, voz, login gov.br, CNH, multas, veículo, MCP. Swagger em `/docs`. |
| [`frontend/`](frontend) | Site: conversa por texto e voz, cards de CNH, multas, Pix e veículo. |

```bash
cd backend && npm install && npm run dev      # http://localhost:3000 (MOCK=1: dados de exemplo, sem chaves)
cd frontend && npm install && npm run dev     # http://localhost:5173
```

- Testes: `npm test` em cada pasta · fluxo completo do backend: `npm run smoke`
- Variáveis: [`backend/.env.example`](backend/.env.example) e [`frontend/.env.example`](frontend/.env.example)

### Deploy

- **Backend (Render):** [`render.yaml`](render.yaml) — Root Directory `backend`, publica só com o CI verde.
- **Frontend (Vercel):** Root Directory `frontend`; `VITE_API_URL` aponta para o backend e o `CORS_ORIGIN` do backend aponta para o site.

### Pontos ainda em validação

- As telas internas do portal (lista de multas, botão de pagamento) foram mapeadas a partir do catálogo oficial, mas ainda precisam ser validadas com um login gov.br real. Até lá, `GUIA_DEMO=1` gera uma guia de **demonstração**, claramente marcada como "não pague".
- A voz exige conta paga na OpenAI (o plano gratuito não tem acesso ao modelo Realtime).
