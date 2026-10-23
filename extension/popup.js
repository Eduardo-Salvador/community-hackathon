const $ = (id) => document.getElementById(id);

async function render() {
  const { token, status = '' } = await chrome.storage.local.get(['token', 'status']);
  $('parear').classList.toggle('hidden', Boolean(token));
  $('conectado').classList.toggle('hidden', !token);
  $('status').textContent = status;
}

$('conectar').onclick = async () => {
  const codigo = $('codigo').value.trim().toUpperCase();
  if (codigo.length !== 6) return void ($('status').textContent = 'O código tem 6 letras/números.');
  const r = await chrome.runtime.sendMessage({ type: 'parear', codigo });
  if (!r?.ok) $('status').textContent = r?.erro ?? 'Não consegui conectar.';
  render();
};

// Login normal do gov.br, numa aba comum do Chrome do usuário (rota protegida força o login).
$('portal').onclick = () => chrome.tabs.create({ url: 'https://portalservicos.senatran.serpro.gov.br/#/infracoes/consultar' });
$('sincronizar').onclick = async () => {
  await chrome.runtime.sendMessage({ type: 'sincronizar' });
  render();
};
$('sair').onclick = async () => {
  await chrome.storage.local.clear();
  render();
};

chrome.storage.onChanged.addListener(render);
render();
