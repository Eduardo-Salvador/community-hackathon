// Roda só nas telas do Portal de Serviços da Senatran, na aba do próprio usuário.
// Espera a tela parar de mudar (o portal é um app Angular) e manda o texto para o background.
(() => {
  let enviado = '';
  let timer;

  // "Consultar Minha Habilitação" é só a lista das CNHs: validade, categoria e situação ficam no detalhe.
  // Abre a CNH marcada como "Atual" (ou a primeira da lista) antes de enviar.
  function abrirCnhAtual() {
    const linhas = [...document.querySelectorAll('tr, [role="row"]')].filter((tr) => /\d{9,}/.test(tr.innerText));
    const alvo = linhas.find((tr) => /\bAtual\b/i.test(tr.innerText)) ?? linhas[0];
    if (!alvo) return false;
    const clicavel = alvo.querySelector('a, button, [role="button"]') ?? alvo;
    clicavel.click();
    return true;
  }

  function talvezEnviar() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const url = location.href;
      // Ainda no login ou na home pública: nada a enviar.
      if (!/#\/(habilitacao|infracoes|veiculos)/.test(url)) return;
      if (/#\/habilitacao\/consultar\b/.test(url) && abrirCnhAtual()) return;
      const texto = document.body.innerText;
      const chave = url + texto.length;
      if (!texto.trim() || chave === enviado) return;
      enviado = chave;
      chrome.storage.local.get('token', ({ token }) => {
        if (token) chrome.runtime.sendMessage({ type: 'pagina', url, texto });
      });
    }, 2500);
  }

  new MutationObserver(talvezEnviar).observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('hashchange', talvezEnviar);
  talvezEnviar();
})();
