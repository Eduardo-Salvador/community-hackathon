// Roda só nas telas do Portal de Serviços da Senatran, na aba do próprio usuário.
// Espera a tela parar de mudar (o portal é um app Angular) e manda o texto para o background.
(() => {
  let enviado = '';
  let timer;

  function talvezEnviar() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const url = location.href;
      // Ainda no login ou na home pública: nada a enviar.
      if (!/#\/(habilitacao|infracoes|veiculos)/.test(url)) return;
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
