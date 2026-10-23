// Roda o roteiro da demo contra um servidor no ar e imprime cada etapa.
// Uso: npm run smoke            (http://localhost:3000)
//      BASE_URL=https://... npm run smoke
import type { StepEvent } from '@hackathon/contracts';

const base = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const icon = { start: '⏳', ok: '✅', error: '❌' } as const;
let failures = 0;

const session = (await (await fetch(`${base}/session`, { method: 'POST' })).json()) as { id: string; token: string };
const headers = {
  'x-session-id': session.id,
  authorization: `Bearer ${session.token}`,
  'content-type': 'application/json',
};

const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
await new Promise<void>((resolve, reject) => {
  ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', sessionId: session.id, token: session.token }));
  ws.onmessage = (e) => {
    const msg = JSON.parse(String(e.data));
    if (msg.type === 'ready') return resolve();
    const ev = msg as StepEvent;
    console.log(`   ${icon[ev.status]} ${ev.service}:${ev.step}`);
  };
  ws.onclose = (e) => reject(new Error(`WebSocket fechou (${e.code})`));
});

async function step(name: string, input: object = {}) {
  console.log(`\n▶ ${name}`);
  const res = await fetch(`${base}/tools/${name}`, { method: 'POST', headers, body: JSON.stringify(input) });
  const body = (await res.json()) as { ok: boolean; result?: any; code?: string; message?: string };
  await new Promise((r) => setTimeout(r, 50)); // deixa os últimos eventos chegarem
  if (!body.ok) {
    failures++;
    console.log(`   ✖ ${res.status} ${body.code}: ${body.message}`);
  }
  return body.result;
}

await step('selecionar_uf', { uf: 'SP' });
await step('iniciar_login');
const cnh = await step('consultar_cnh');
if (cnh) console.log(`   → CNH ${cnh.categoria}, validade ${cnh.validade}, ${cnh.situacao}`);

const pdf = await step('baixar_cnh');
if (pdf?.fileId) {
  const res = await fetch(`${base}/files/${pdf.fileId}`, { headers });
  const ok = res.ok && res.headers.get('content-type') === 'application/pdf';
  if (!ok) failures++;
  console.log(`   ${ok ? '→ PDF baixado' : '✖ falha ao baixar PDF'} (${res.status})`);
}

const multas = await step('listar_multas');
if (multas) {
  console.log(`   → ${multas.multas.length} multas, ${multas.pontos.total}/${multas.pontos.limite} pontos (${multas.pontos.alerta})`);
  const guia = await step('gerar_guia_multa', { multaId: multas.multas[0].id });
  if (guia?.pdfFileId) {
    const res = await fetch(`${base}/files/${guia.pdfFileId}`, { headers });
    const ok = res.ok && res.headers.get('content-type') === 'application/pdf';
    if (!ok) failures++;
    console.log(`   ${ok ? '→ Guia PDF baixada' : '✖ falha ao baixar guia PDF'} (${res.status})`);
  }
}

const veiculos = await step('consultar_veiculos');
if (veiculos) {
  console.log(`   → ${veiculos.veiculos.length} veículo(s)`);
  const crlvFileId = veiculos.veiculos[0]?.crlvFileId;
  if (crlvFileId) {
    const res = await fetch(`${base}/files/${crlvFileId}`, { headers });
    const ok = res.ok && res.headers.get('content-type') === 'application/pdf';
    if (!ok) failures++;
    console.log(`   ${ok ? '→ CRLV-e baixado' : '✖ falha ao baixar CRLV-e'} (${res.status})`);
  }
}

ws.close();
console.log(failures ? `\n✖ ${failures} falha(s)` : '\n✔ fluxo completo OK');
process.exit(failures ? 1 : 0);
