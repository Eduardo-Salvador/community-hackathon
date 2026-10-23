// Fala com o backend do Tupi Brasil. O login no gov.br acontece numa aba normal do Chrome do usuário;
// a extensão só lê o texto das telas do portal e envia para a conversa pareada.
const BACKEND = 'https://community-hackathon-backend.onrender.com';
const PORTAL = 'https://portalservicos.senatran.serpro.gov.br/';
const TELAS = ['#/habilitacao/consultar', '#/infracoes/consultar', '#/veiculos/meus-veiculos'];

async function post(path, body, token) {
  const res = await fetch(BACKEND + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const status = (texto) => chrome.storage.local.set({ status: texto });

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  (async () => {
    if (msg.type === 'parear') {
      const r = await post('/extension/claim', { codigo: msg.codigo });
      if (!r.ok) return reply({ ok: false, erro: 'Código inválido ou expirado. Peça um novo ao assistente.' });
      await chrome.storage.local.set({ token: r.data.token, status: 'Conectado. Entre no gov.br e clique em Sincronizar.' });
      return reply({ ok: true });
    }
    if (msg.type === 'sincronizar') {
      // Abre uma aba no portal; o content script manda cada tela quando ela termina de carregar.
      await chrome.storage.local.set({ fila: TELAS.slice(1), status: 'Lendo sua CNH…' });
      await chrome.tabs.create({ url: PORTAL + TELAS[0] });
      return reply({ ok: true });
    }
    if (msg.type === 'pagina') {
      const { token, fila = [] } = await chrome.storage.local.get(['token', 'fila']);
      if (!token) return reply({ ok: false });
      const r = await post('/extension/page', { url: msg.url, texto: msg.texto }, token);
      if (r.status === 401) {
        await chrome.storage.local.remove('token');
        await status('A conversa expirou. Peça um novo código ao assistente.');
        return reply({ ok: false });
      }
      if (r.data?.ignorada) return reply({ ok: true, ignorada: true });
      // Próxima tela da sincronização, na mesma aba.
      const [proxima, ...resto] = fila;
      await chrome.storage.local.set({ fila: resto });
      if (proxima && _sender.tab?.id) {
        await status(proxima.includes('infracoes') ? 'Lendo suas multas…' : 'Lendo seus veículos…');
        await chrome.tabs.update(_sender.tab.id, { url: PORTAL + proxima });
      } else if (!proxima) {
        await status(r.ok ? 'Pronto! Volte para o Tupi Brasil.' : 'Não consegui ler esta tela. Tente Sincronizar de novo.');
      }
      return reply({ ok: r.ok });
    }
  })();
  return true;
});
