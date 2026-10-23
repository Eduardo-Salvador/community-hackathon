import { ApiError, type ApiClient, type ToolInput } from '../api/client';
import {
  isToolName, type Cnh, type Guia, type Multa, type ResumoPontos, type ShareLink, type StepEvent, type ToolName,
  type ToolResults, type UF, type Veiculo,
} from '../api/types';
import type { EventStream, OpenEventStream } from '../api/events';
import { detectIntent, normalize, type Action, type Intent } from '../lib/intents';
import {
  CNH_DOWNLOADED, CNH_RECEIPT_DOWNLOADED, FALLBACK_ERROR, GOVBR_EXPIRED, LOGIN_AGAIN_DONE, LOGIN_TIMEOUT, NOT_AVAILABLE,
  PIX_DECLINED, RETRY_LATER, SUGGESTIONS, UF_QUESTION, UNKNOWN,
  bestDiscount, cnhMessage, guiaReadyMessage, loginMessage, multasMessage, pixConfirmMessage, ufSaved, veiculoMessage,
} from './copy';

export type ChipStatus = 'waiting' | 'ok' | 'error';
export type Chip = { key: string; label: string; status: ChipStatus };

export type Card =
  | { type: 'uf' }
  | { type: 'login'; liveViewUrl?: string; status: 'waiting' | 'done' | 'expired' }
  | { type: 'cnh'; cnh: Cnh }
  | { type: 'multas'; multas: Multa[]; resumo: ResumoPontos }
  | { type: 'pixConfirm'; multa: Multa }
  | { type: 'pix'; multa: Multa; guia: Guia }
  | { type: 'veiculo'; veiculos: Veiculo[]; uf?: UF };

export type UserItem = { kind: 'user'; id: string; text: string };
export type AssistantItem = {
  kind: 'assistant';
  id: string;
  text?: string;
  chips: Chip[];
  card?: Card;
  busy: boolean;
  suggestions?: string[];
};
export type Item = UserItem | AssistantItem;

export type Offer =
  | { type: 'uf' }
  | { type: 'pdf' }
  | { type: 'pix' }
  | { type: 'confirm'; turn: string; multa: Multa };

export type ConversationState = {
  items: Item[];
  uf?: UF;
  busy: boolean;
  offer?: Offer;
};

export type CnhFile = { blob: Blob; fileId: string; tipo: 'pdf' | 'comprovante'; filename: string };

type PendingLogin = {
  turn: string;
  action?: Action;
  eventOk: boolean;
  resultOk: boolean;
  simulated: boolean;
  mock?: boolean;
};

const STEP_LABELS: Partial<Record<string, { start: string; ok: (data: unknown) => string }>> = {
  selecionar_uf: { start: 'Definindo estado', ok: (data) => `Estado: ${(data as { uf?: string })?.uf ?? ''}` },
  consultar_cnh: { start: 'Consultando CNH', ok: () => 'CNH encontrada' },
  baixar_cnh: { start: 'Gerando PDF', ok: () => 'PDF pronto' },
  listar_multas: { start: 'Buscando multas', ok: () => 'Multas consultadas' },
  gerar_guia_multa: { start: 'Gerando pagamento', ok: () => 'Guia gerada' },
  consultar_veiculos: { start: 'Consultando veículo', ok: () => 'Veículo consultado' },
};

const INTERNAL_STEPS: Partial<Record<string, string>> = {
  abrindo_navegador: 'Abrindo navegador',
  abrindo_portal: 'Abrindo portal',
  abrindo_secao_cnh: 'Abrindo seção da CNH',
  extraindo_dados: 'Lendo dados',
  baixando_pdf: 'Baixando PDF',
  gerando_comprovante: 'Gerando comprovante',
  obtendo_pagina: 'Carregando página',
  extraindo_multas: 'Lendo multas',
  extraindo_veiculos: 'Lendo veículos',
  consultando_api_fallback: 'Consultando outra fonte',
  repetindo_consulta_api: 'Tentando de novo',
  mapeando_dados_api: 'Organizando dados',
  calculando_pontos: 'Calculando pontos',
  validando_multa: 'Validando multa',
  calculando_desconto_sne: 'Calculando desconto SNE',
  gerando_pagamento: 'Gerando Pix e boleto',
  preparando_pdf: 'Preparando PDF',
  preparando_crlv: 'Preparando CRLV',
  carregando_mock: 'Carregando dados de teste',
};

const LOGIN_STEPS = new Set(['iniciar_login', 'aguardando_usuario', 'sessao_govbr']);
const FLOW_ERRORS = new Set(['UF_REQUIRED', 'LOGIN_REQUIRED', 'IDENTIFIERS_REQUIRED']);
const RETRYABLE = new Set(['BAD_SOURCE_DATA', 'SOURCE_UNAVAILABLE', 'EXTRACTION_FAILED', 'BROWSER_UNAVAILABLE']);
const SHARE_MARGIN_MS = 60_000;

const LOGIN_DONE: Chip = { key: 'login', label: 'Login gov.br', status: 'ok' };
const MOCK_LIVE_VIEW = 'about:blank';
const EVENTS_READY_TIMEOUT_MS = 1500;
const DEMO_SCRIPT = [
  'Tenho multa? Quantos pontos eu tenho?',
  'Gera o Pix da multa de sinal vermelho',
  'Minha CNH vence quando?',
  'Meu carro está em dia?',
];

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return FALLBACK_ERROR;
  if (error.code === 'NOT_IMPLEMENTED') return NOT_AVAILABLE;
  if (RETRYABLE.has(error.code)) return RETRY_LATER;
  if (error.code === 'INVALID_INPUT' && error.message !== error.code) return error.message;
  return FALLBACK_ERROR;
}

const EXTENSIONS: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png' };

function filename(base: string, blob: Blob): string {
  return `${base}.${EXTENSIONS[blob.type.split(';')[0] ?? ''] ?? 'pdf'}`;
}

function humanize(step: string): string {
  const text = step.replace(/[_-]+/g, ' ').trim();
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export class ConversationStore {
  private state: ConversationState = { items: [], busy: false };
  private readonly listeners = new Set<() => void>();
  private seq = 0;
  private activeTurn?: string;
  private pendingAction?: Action;
  private pendingLogin?: PendingLogin;
  private multas: Multa[] = [];
  private cnhFile?: Promise<CnhFile>;
  private readonly shareLinks = new Map<string, ShareLink>();
  private readonly loginListeners = new Set<() => void>();
  private voiceTurn?: string;
  private events?: EventStream;
  private demoIndex = 0;

  constructor(
    private readonly api: ApiClient,
    private readonly openEvents?: OpenEventStream,
    private readonly now: () => Date = () => new Date(),
  ) {
    api.onSessionChange((credentials) => {
      if (credentials) return;
      this.events?.close();
      this.events = undefined;
    });
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => this.state;

  lastAssistant(): AssistantItem | undefined {
    for (let index = this.state.items.length - 1; index >= 0; index -= 1) {
      const item = this.state.items[index];
      if (item?.kind === 'assistant') return item;
    }
    return undefined;
  }

  demoUtterance(): string {
    const offer = this.state.offer;
    if (offer?.type === 'uf') return 'Sou de São Paulo';
    if (offer?.type === 'confirm') return 'Sim, pode gerar';
    return DEMO_SCRIPT[this.demoIndex % DEMO_SCRIPT.length] ?? '';
  }

  intentOf(text: string): Intent {
    return detectIntent(text, this.state.offer?.type === 'uf');
  }

  send = async (raw: string): Promise<void> => {
    const text = raw.trim();
    if (!text || this.state.busy) return;
    if (text === DEMO_SCRIPT[this.demoIndex % DEMO_SCRIPT.length]) this.demoIndex += 1;
    this.addUser(text);
    await this.withBusy(() => this.handleIntent(this.intentOf(text)));
  };

  pickUf = async (uf: UF): Promise<void> => {
    if (this.state.busy) return;
    this.addUser(`Sou de ${uf}`);
    await this.withBusy(() => this.applyUf(uf));
  };

  requestPix = async (multa: Multa): Promise<void> => {
    if (this.state.busy) return;
    this.addUser(`Gerar Pix: ${multa.descricao}`);
    await this.withBusy(() => this.run({ type: 'pix', multaId: multa.id }, this.newTurn()));
  };

  confirmPix = async (turn: string): Promise<void> => {
    if (this.state.busy) return;
    await this.withBusy(() => this.generatePix(turn, turn));
  };

  declinePix = (turn: string) => {
    this.set({ offer: undefined });
    this.updateItem(turn, { text: PIX_DECLINED, card: undefined });
  };

  simulateLogin = async (): Promise<void> => {
    if (!this.pendingLogin || this.pendingLogin.simulated || this.pendingLogin.mock === false) return;
    this.addUser('Pronto, entrei');
    this.pendingLogin.simulated = true;
    await this.maybeFinishLogin();
  };

  retryLogin = async (turn: string): Promise<void> => {
    const pending = this.pendingLogin;
    if (this.state.busy || !pending || pending.turn !== turn) return;
    await this.withBusy(async () => {
      try {
        await this.startLogin(pending.action, turn);
      } catch (error) {
        this.updateItem(turn, { text: errorMessage(error), card: undefined });
      }
    });
  };

  cnhDocument = (): Promise<CnhFile> => {
    this.cnhFile ??= this.call('baixar_cnh', {})
      .then(async ({ fileId, tipo }) => {
        const blob = await this.api.fetchFile(fileId);
        return { blob, fileId, tipo, filename: filename(tipo === 'pdf' ? 'cnh-digital' : 'cnh-comprovante', blob) };
      })
      .catch((error: unknown) => {
        this.cnhFile = undefined;
        throw error;
      });
    return this.cnhFile;
  };

  downloadCnh = async (): Promise<CnhFile> => {
    const file = await this.cnhDocument();
    saveBlob(file.blob, file.filename);
    return file;
  };

  cnhShareLink = async (): Promise<ShareLink> => {
    const { fileId } = await this.cnhDocument();
    return this.shareLink(fileId);
  };

  shareLink = async (fileId: string): Promise<ShareLink> => {
    const cached = this.shareLinks.get(fileId);
    if (cached && Date.parse(cached.expiresAt) - SHARE_MARGIN_MS > Date.now()) return cached;
    const link = await this.api.shareFile(fileId);
    this.shareLinks.set(fileId, link);
    return link;
  };

  downloadFile = async (fileId: string, base: string): Promise<void> => {
    const blob = await this.api.fetchFile(fileId);
    saveBlob(blob, filename(base, blob));
  };

  onLoginDone = (listener: () => void): (() => void) => {
    this.loginListeners.add(listener);
    return () => {
      this.loginListeners.delete(listener);
    };
  };

  voiceUserSaid = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    this.addUser(text);
    this.voiceTurn = undefined;
  };

  voiceAssistantSaid = (raw: string) => {
    const text = raw.trim();
    if (!text) return;
    const current = this.voiceTurn ? this.findAssistant(this.voiceTurn) : undefined;
    if (current && !current.text) {
      this.updateItem(current.id, { text });
      return;
    }
    const turn = this.newTurn();
    this.updateItem(turn, { text, busy: false });
    this.voiceTurn = turn;
  };

  voiceTool = async (name: string, args: unknown): Promise<unknown> => {
    if (!isToolName(name)) return { ok: false, code: 'UNKNOWN_TOOL', message: 'Tool desconhecida.' };
    const input = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
    const current = this.voiceTurn ? this.findAssistant(this.voiceTurn) : undefined;
    const turn = current && !current.card ? current.id : this.newTurn();
    this.voiceTurn = turn;
    this.activeTurn = turn;
    this.updateItem(turn, { busy: true });
    try {
      const result =
        name === 'iniciar_login' ? await this.startLogin(undefined, turn) : await this.call(name, input as never, turn);
      await this.applyVoiceResult(name, result, input, turn);
      return { ok: true, result };
    } catch (error) {
      if (error instanceof ApiError) {
        return error.body && typeof error.body === 'object'
          ? error.body
          : { ok: false, code: error.code, message: error.message };
      }
      return { ok: false, code: 'INTERNAL', message: 'Não foi possível concluir a consulta.' };
    } finally {
      this.updateItem(turn, { busy: false });
    }
  };

  private async applyVoiceResult(name: ToolName, result: unknown, input: Record<string, unknown>, turn: string) {
    switch (name) {
      case 'selecionar_uf':
        this.set({ uf: (result as ToolResults['selecionar_uf']).uf });
        return;
      case 'consultar_cnh': {
        const cnh = result as ToolResults['consultar_cnh'];
        this.set({ offer: { type: 'pdf' } });
        this.updateItem(turn, { card: { type: 'cnh', cnh } });
        return;
      }
      case 'baixar_cnh': {
        const { fileId, tipo } = result as ToolResults['baixar_cnh'];
        const blob = await this.api.fetchFile(fileId);
        const file: CnhFile = { blob, fileId, tipo, filename: filename(tipo === 'pdf' ? 'cnh-digital' : 'cnh-comprovante', blob) };
        this.cnhFile = Promise.resolve(file);
        saveBlob(blob, file.filename);
        return;
      }
      case 'listar_multas': {
        const { multas, pontos } = result as ToolResults['listar_multas'];
        this.multas = multas;
        this.updateItem(turn, { card: { type: 'multas', multas, resumo: pontos } });
        return;
      }
      case 'gerar_guia_multa': {
        const guia = result as ToolResults['gerar_guia_multa'];
        const multa = this.multas.find((item) => item.id === (input.multaId ?? guia.multaId));
        if (multa) this.updateItem(turn, { card: { type: 'pix', multa, guia } });
        return;
      }
      case 'consultar_veiculos': {
        const { veiculos } = result as ToolResults['consultar_veiculos'];
        this.updateItem(turn, { card: { type: 'veiculo', veiculos, uf: this.state.uf } });
        return;
      }
      case 'conectar_extensao': {
        // Código para digitar na extensão do Chrome: fica escrito na conversa, além de falado.
        const { codigo } = result as ToolResults['conectar_extensao'];
        this.updateItem(turn, {
          text: `Seu código da extensão: ${codigo.split('').join(' ')}. Abra a extensão Tupi Brasil no Chrome, digite o código, entre no gov.br e clique em Sincronizar.`,
        });
        return;
      }
      default:
        return;
    }
  }

  goHome = () => {
    this.clearLocal();
    this.set({ items: [], busy: false, offer: undefined });
  };

  reset = async (): Promise<void> => {
    this.clearLocal();
    this.events?.close();
    this.events = undefined;
    this.state = { items: [], busy: false };
    this.emit();
    await this.api.end();
  };

  private clearLocal() {
    this.activeTurn = undefined;
    this.pendingAction = undefined;
    this.pendingLogin = undefined;
    this.multas = [];
    this.voiceTurn = undefined;
    this.cnhFile = undefined;
    this.shareLinks.clear();
  }

  private async handleIntent(intent: Intent): Promise<void> {
    const offer = this.state.offer;
    switch (intent.type) {
      case 'uf':
        return this.applyUf(intent.uf);
      case 'action':
        return this.run(intent.action, this.newTurn());
      case 'yes':
        if (offer?.type === 'confirm') return this.generatePix(offer.turn, this.newTurn());
        if (offer?.type === 'pdf') return this.run({ type: 'baixarCnh' }, this.newTurn());
        if (offer?.type === 'pix') return this.run({ type: 'pix' }, this.newTurn());
        return this.reply(UNKNOWN, SUGGESTIONS);
      case 'no':
        if (offer?.type === 'confirm') {
          this.updateItem(offer.turn, { card: undefined });
          this.set({ offer: undefined });
          return this.reply(PIX_DECLINED);
        }
        this.set({ offer: undefined });
        return this.reply('Tudo bem. Se precisar de algo, é só falar.');
      default:
        return this.reply(UNKNOWN, SUGGESTIONS);
    }
  }

  private reply(text: string, suggestions?: string[]) {
    const turn = this.newTurn();
    this.updateItem(turn, { text, suggestions, busy: false });
  }

  private async applyUf(uf: UF): Promise<void> {
    this.removeCards('uf');
    const turn = this.newTurn();
    try {
      await this.call('selecionar_uf', { uf }, turn);
    } catch {
      this.updateItem(turn, { text: FALLBACK_ERROR, busy: false });
      return;
    }
    this.set({ uf, offer: undefined });
    const pending = this.pendingAction;
    this.pendingAction = undefined;
    if (pending) return this.run(pending, turn);
    this.updateItem(turn, { text: ufSaved(uf), busy: false });
  }

  private async run(action: Action, turn: string): Promise<void> {
    this.activeTurn = turn;
    try {
      await this.execute(action, turn);
    } catch (error) {
      await this.recover(error, action, turn);
    } finally {
      this.updateItem(turn, { busy: false });
    }
  }

  private async recover(error: unknown, action: Action, turn: string): Promise<void> {
    const code = error instanceof ApiError ? error.flowCode : undefined;
    if (code === 'UF_REQUIRED') {
      this.pendingAction = action;
      this.set({ offer: { type: 'uf' } });
      this.updateItem(turn, { text: UF_QUESTION, card: { type: 'uf' }, busy: false });
      return;
    }
    if (code === 'LOGIN_REQUIRED' || (error instanceof ApiError && error.code === 'IDENTIFIERS_REQUIRED')) {
      try {
        await this.startLogin(action, turn);
      } catch (loginError) {
        if (loginError instanceof ApiError && loginError.flowCode === 'LOGIN_REQUIRED') {
          this.updateItem(turn, { text: FALLBACK_ERROR, card: undefined, busy: false });
          return;
        }
        await this.recover(loginError, action, turn);
      }
      return;
    }
    this.updateItem(turn, { text: errorMessage(error), busy: false });
  }

  private async execute(action: Action, turn: string): Promise<void> {
    switch (action.type) {
      case 'cnh': {
        const cnh = await this.call('consultar_cnh', {}, turn);
        this.set({ offer: { type: 'pdf' } });
        this.updateItem(turn, { text: cnhMessage(cnh), card: { type: 'cnh', cnh } });
        return;
      }
      case 'baixarCnh': {
        const { fileId, tipo } = await this.call('baixar_cnh', {}, turn);
        const blob = await this.api.fetchFile(fileId);
        const file: CnhFile = { blob, fileId, tipo, filename: filename(tipo === 'pdf' ? 'cnh-digital' : 'cnh-comprovante', blob) };
        this.cnhFile = Promise.resolve(file);
        saveBlob(blob, file.filename);
        this.set({ offer: undefined });
        this.updateItem(turn, { text: tipo === 'pdf' ? CNH_DOWNLOADED : CNH_RECEIPT_DOWNLOADED });
        return;
      }
      case 'multas': {
        const { multas, pontos: resumo } = await this.call('listar_multas', {}, turn);
        this.multas = multas;
        this.set({ offer: multas.length > 0 ? { type: 'pix' } : undefined });
        this.updateItem(turn, { text: multasMessage(multas, resumo, this.now()), card: { type: 'multas', multas, resumo } });
        return;
      }
      case 'pix': {
        if (this.multas.length === 0 || !this.multas.some((multa) => multa.id === action.multaId)) {
          const { multas } = await this.call('listar_multas', {}, turn);
          this.multas = multas;
        }
        const multa = this.pickMulta(action);
        if (!multa) {
          this.set({ offer: undefined });
          this.updateItem(turn, { text: 'Você não tem multas para pagar agora.' });
          return;
        }
        this.set({ offer: { type: 'confirm', turn, multa } });
        this.updateItem(turn, { text: pixConfirmMessage(multa), card: { type: 'pixConfirm', multa } });
        return;
      }
      case 'veiculo': {
        const { veiculos } = await this.call('consultar_veiculos', {}, turn);
        this.set({ offer: undefined });
        this.updateItem(turn, { text: veiculoMessage(veiculos), card: { type: 'veiculo', veiculos, uf: this.state.uf } });
        return;
      }
    }
  }

  private pickMulta(action: Extract<Action, { type: 'pix' }>): Multa | undefined {
    if (action.multaId) return this.multas.find((multa) => multa.id === action.multaId);
    if (action.hint) {
      const hintWords = new Set(action.hint.split(' ').filter((word) => word.length > 3));
      const scored = this.multas
        .map((multa) => ({
          multa,
          score: normalize(multa.descricao).split(' ').filter((word) => hintWords.has(word)).length,
        }))
        .sort((a, b) => b.score - a.score);
      if (scored[0] && scored[0].score > 0) return scored[0].multa;
    }
    return bestDiscount(this.multas) ?? this.multas[0];
  }

  private async generatePix(sourceTurn: string, turn: string): Promise<void> {
    const offer = this.state.offer;
    const source = this.state.items.find((item) => item.id === sourceTurn);
    const multa =
      source?.kind === 'assistant' && source.card?.type === 'pixConfirm'
        ? source.card.multa
        : offer?.type === 'confirm'
          ? offer.multa
          : undefined;
    if (!multa) return;
    this.set({ offer: undefined });
    if (turn !== sourceTurn) this.updateItem(sourceTurn, { card: undefined });
    this.activeTurn = turn;
    this.updateItem(turn, { busy: true, card: undefined, text: turn === sourceTurn ? 'Gerando o Pix…' : undefined });
    try {
      const guia = await this.call('gerar_guia_multa', { multaId: multa.id }, turn);
      this.updateItem(turn, { text: guiaReadyMessage(guia), card: { type: 'pix', multa, guia }, suggestions: ['E meu carro?'] });
    } catch (error) {
      await this.recover(error, { type: 'pix', multaId: multa.id }, turn);
    } finally {
      this.updateItem(turn, { busy: false });
    }
  }

  private async startLogin(action: Action | undefined, turn: string): Promise<ToolResults['iniciar_login']> {
    this.activeTurn = turn;
    this.pendingLogin = { turn, action, eventOk: false, resultOk: false, simulated: false };
    this.updateItem(turn, { text: loginMessage(action), card: { type: 'login', status: 'waiting' }, busy: false });
    this.setChip(turn, { key: 'login', label: 'Esperando você entrar', status: 'waiting' });
    const result = await this.call('iniciar_login', {}, turn);
    const pending = this.pendingLogin;
    if (!pending || pending.turn !== turn) return result;
    pending.mock = result.liveViewUrl === MOCK_LIVE_VIEW;
    pending.resultOk = result.loggedIn;
    this.updateCard(turn, (card) => (card.type === 'login' && !card.liveViewUrl ? { ...card, liveViewUrl: result.liveViewUrl } : card));
    await this.maybeFinishLogin();
    return result;
  }

  private async maybeFinishLogin(): Promise<void> {
    const pending = this.pendingLogin;
    if (!pending || pending.mock === undefined) return;
    const loggedIn = pending.eventOk || pending.resultOk;
    if (!loggedIn || (pending.mock && !pending.simulated)) return;
    this.pendingLogin = undefined;
    this.updateCard(pending.turn, (card) => (card.type === 'login' ? { ...card, status: 'done' } : card));
    this.setChip(pending.turn, LOGIN_DONE);
    const action = pending.action;
    if (!action) {
      if (this.loginListeners.size > 0) this.loginListeners.forEach((listener) => listener());
      else this.reply(LOGIN_AGAIN_DONE);
      return;
    }
    const turn = this.newTurn([LOGIN_DONE]);
    await this.withBusy(() => this.run(action, turn));
  }

  private onLoginEvent(event: StepEvent) {
    const data = (event.data ?? {}) as { liveViewUrl?: string; code?: string };
    const pending = this.pendingLogin;
    if (event.step === 'aguardando_usuario' && pending) {
      if (event.status === 'start' && data.liveViewUrl) {
        const url = data.liveViewUrl;
        this.updateCard(pending.turn, (card) => (card.type === 'login' ? { ...card, liveViewUrl: url } : card));
      } else if (event.status === 'ok') {
        pending.eventOk = true;
        void this.maybeFinishLogin();
      } else if (event.status === 'error') {
        this.updateCard(pending.turn, (card) => (card.type === 'login' ? { ...card, status: 'expired' } : card));
        this.setChip(pending.turn, { key: 'login', label: 'Tempo esgotado', status: 'error' });
        this.updateItem(pending.turn, { text: data.code === 'LOGIN_TIMEOUT' ? LOGIN_TIMEOUT : FALLBACK_ERROR });
      }
    }
    if (event.step === 'sessao_govbr' && event.status === 'error' && !pending) {
      void this.relogin();
    }
  }

  private async relogin(): Promise<void> {
    const turn = this.newTurn();
    this.updateItem(turn, { text: GOVBR_EXPIRED, busy: false });
    try {
      await this.startLogin(undefined, turn);
    } catch (error) {
      this.updateItem(turn, { text: errorMessage(error), card: undefined });
    }
  }

  private onEvent(event: StepEvent) {
    if (event.service === 'login' && LOGIN_STEPS.has(event.step)) {
      this.onLoginEvent(event);
      return;
    }
    const turn = this.activeTurn;
    if (!turn) return;
    const code = (event.data as { code?: string } | undefined)?.code;
    if (event.status === 'error' && code && FLOW_ERRORS.has(code)) {
      this.removeChip(turn, event.step);
      return;
    }
    this.stepChip(turn, event.step, event.status, event.data);
  }

  private async ensureEvents(): Promise<void> {
    if (!this.openEvents) return;
    const credentials = await this.api.session();
    if (!this.events) this.events = this.openEvents(credentials, (event) => this.onEvent(event));
    await Promise.race([this.events.ready, new Promise((resolve) => setTimeout(resolve, EVENTS_READY_TIMEOUT_MS))]);
  }

  private async call<N extends ToolName>(name: N, input: ToolInput<N>, turn?: string): Promise<ToolResults[N]> {
    await this.ensureEvents();
    if (turn) this.stepChip(turn, name, 'start');
    try {
      const result = await this.api.callTool(name, input);
      if (turn) this.stepChip(turn, name, 'ok', result);
      return result;
    } catch (error) {
      if (turn) {
        if (error instanceof ApiError && FLOW_ERRORS.has(error.code)) this.removeChip(turn, name);
        else this.stepChip(turn, name, 'error');
      }
      throw error;
    }
  }

  private stepChip(turn: string, step: string, status: StepEvent['status'], data?: unknown) {
    if (LOGIN_STEPS.has(step)) return;
    const labels = STEP_LABELS[step];
    const base = labels?.start ?? INTERNAL_STEPS[step] ?? humanize(step);
    const label = status === 'ok' ? (labels?.ok(data) ?? base) : status === 'start' ? base : `Falhou: ${base.toLowerCase()}`;
    const current = this.findAssistant(turn)?.chips.find((chip) => chip.key === step);
    if (current?.status === 'ok' && status === 'start') return;
    this.setChip(turn, { key: step, label, status: status === 'start' ? 'waiting' : status });
  }

  private setChip(turn: string, chip: Chip) {
    const item = this.findAssistant(turn);
    if (!item) return;
    const exists = item.chips.some((current) => current.key === chip.key);
    const chips = exists ? item.chips.map((current) => (current.key === chip.key ? chip : current)) : [...item.chips, chip];
    this.updateItem(turn, { chips });
  }

  private removeChip(turn: string, key: string) {
    const item = this.findAssistant(turn);
    if (!item) return;
    this.updateItem(turn, { chips: item.chips.filter((chip) => chip.key !== key) });
  }

  private removeCards(type: Card['type']) {
    this.set({
      items: this.state.items.map((item) =>
        item.kind === 'assistant' && item.card?.type === type ? { ...item, card: undefined } : item,
      ),
    });
  }

  private findAssistant(id: string): AssistantItem | undefined {
    const item = this.state.items.find((candidate) => candidate.id === id);
    return item?.kind === 'assistant' ? item : undefined;
  }

  private addUser(text: string) {
    this.set({ items: [...this.state.items, { kind: 'user', id: this.nextId(), text }] });
  }

  private newTurn(chips: Chip[] = []): string {
    const id = this.nextId();
    this.activeTurn = id;
    this.set({ items: [...this.state.items, { kind: 'assistant', id, chips, busy: true }] });
    return id;
  }

  private updateItem(id: string, patch: Partial<Omit<AssistantItem, 'kind' | 'id'>>) {
    this.set({
      items: this.state.items.map((item) => (item.id === id && item.kind === 'assistant' ? { ...item, ...patch } : item)),
    });
  }

  private updateCard(id: string, update: (card: Card) => Card) {
    const item = this.findAssistant(id);
    if (item?.card) this.updateItem(id, { card: update(item.card) });
  }

  private async withBusy(task: () => Promise<void>): Promise<void> {
    this.set({ busy: true });
    try {
      await task();
    } finally {
      this.set({ busy: false });
    }
  }

  private nextId(): string {
    this.seq += 1;
    return `m${this.seq}`;
  }

  private set(patch: Partial<ConversationState>) {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit() {
    this.listeners.forEach((listener) => listener());
  }
}
