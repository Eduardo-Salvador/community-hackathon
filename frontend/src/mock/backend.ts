import type { OpenEventStream } from '../api/events';
import {
  UF_LIST, type Cnh, type Guia, type Multa, type ResumoPontos, type ServiceName, type StepEvent, type ToolErrorCode,
  type ToolName, type UF, type Veiculo,
} from '../api/types';

const CNH: Cnh = {
  nome: 'MARIA DA SILVA',
  registro: '01234567890',
  categoria: 'AB',
  validade: '2027-03-15',
  situacao: 'regular',
};

const MULTAS: Multa[] = [
  {
    id: 'm1',
    descricao: 'Avançar sinal vermelho',
    data: '2026-03-10',
    local: 'Av. Paulista, São Paulo',
    gravidade: 'gravissima',
    pontos: 7,
    valor: 293.47,
    valorComDesconto: 176.08,
    prazoDesconto: '2026-11-10',
    expiraContagemEm: '2027-03-10',
  },
  {
    id: 'm2',
    descricao: 'Velocidade até 20% acima',
    data: '2026-06-02',
    local: 'Marginal Tietê, São Paulo',
    gravidade: 'media',
    pontos: 4,
    valor: 130.16,
    expiraContagemEm: '2027-06-02',
  },
];

const PONTOS: ResumoPontos = { total: 11, limite: 30, alerta: 'verde' };

const VEICULOS: Veiculo[] = [
  {
    placa: 'ABC1D23',
    modelo: 'VW GOL 1.0',
    licenciamento: { pago: false, vencimento: '2026-10-31' },
    ipvaEmAberto: 0,
    restricoes: [],
    recall: [],
  },
];

const PDF =
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';

const TOOL_INPUTS: Record<ToolName, (input: Record<string, unknown>) => boolean> = {
  selecionar_uf: (input) => UF_LIST.includes(input.uf as UF),
  iniciar_login: () => true,
  consultar_cnh: () => true,
  baixar_cnh: () => true,
  listar_multas: () => true,
  gerar_guia_multa: (input) => typeof input.multaId === 'string' && input.multaId.length > 0 && input.multaId.length <= 64,
  consultar_veiculos: () => true,
};

const SERVICES: Record<ToolName, ServiceName> = {
  selecionar_uf: 'uf',
  iniciar_login: 'login',
  consultar_cnh: 'cnh',
  baixar_cnh: 'cnh',
  listar_multas: 'multas',
  gerar_guia_multa: 'multas',
  consultar_veiculos: 'veiculo',
};

type Shared = { fileId: string; expiresAt: number };

type MockSession = {
  token: string;
  uf?: UF;
  loggedIn: boolean;
  listedMultas: boolean;
  files: Set<string>;
  listeners: Set<(event: StepEvent) => void>;
};

class ToolFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const NEXT: Partial<Record<ToolErrorCode, unknown>> = {
  UF_REQUIRED: { action: 'ask_uf', tool: 'selecionar_uf', reason: 'Selecione o estado antes de continuar' },
  LOGIN_REQUIRED: { action: 'require_login', tool: 'iniciar_login', reason: 'Faça login no gov.br primeiro' },
};

const brl = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const randomId = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

export function createMockBackend({ delayMs = 600 }: { delayMs?: number } = {}) {
  const sessions = new Map<string, MockSession>();
  const files = new Map<string, string>();
  const shared = new Map<string, Shared>();
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));

  const authenticate = (headers: Headers): [string, MockSession] | undefined => {
    const id = headers.get('x-session-id') ?? '';
    const session = sessions.get(id);
    const bearer = headers.get('authorization')?.replace(/^Bearer /, '');
    return session && bearer === session.token ? [id, session] : undefined;
  };

  const emit = (id: string, session: MockSession, service: ServiceName, step: string, status: StepEvent['status'], data?: unknown) => {
    const event: StepEvent = { sessionId: id, service, step, status, data, at: new Date().toISOString() };
    session.listeners.forEach((listener) => listener(event));
  };

  const storeFile = (session: MockSession) => {
    const fileId = randomId();
    files.set(fileId, PDF);
    session.files.add(fileId);
    return fileId;
  };

  const requireUf = (session: MockSession) => {
    if (!session.uf) throw new ToolFailure(409, 'UF_REQUIRED', 'Selecione o estado antes de continuar');
  };

  const requireLogin = (session: MockSession) => {
    requireUf(session);
    if (!session.loggedIn) throw new ToolFailure(409, 'LOGIN_REQUIRED', 'Faça login no gov.br primeiro');
  };

  const run = async (
    name: ToolName,
    input: Record<string, unknown>,
    session: MockSession,
    step: (step: string, data?: unknown) => Promise<void>,
  ): Promise<unknown> => {
    switch (name) {
      case 'selecionar_uf':
        session.uf = input.uf as UF;
        return { uf: session.uf };
      case 'iniciar_login':
        requireUf(session);
        await wait();
        await step('aguardando_usuario', { liveViewUrl: 'about:blank' });
        session.loggedIn = true;
        return { liveViewUrl: 'about:blank', loggedIn: true };
      case 'consultar_cnh':
        requireLogin(session);
        await step('extraindo_dados');
        return CNH;
      case 'baixar_cnh':
        requireLogin(session);
        await step('baixando_pdf');
        return { fileId: storeFile(session), tipo: 'pdf' };
      case 'listar_multas':
        requireLogin(session);
        await step('carregando_mock', { quantidade: MULTAS.length });
        await step('calculando_pontos', PONTOS);
        session.listedMultas = true;
        return { multas: MULTAS, pontos: PONTOS };
      case 'gerar_guia_multa': {
        requireLogin(session);
        const multaId = String(input.multaId);
        if (!session.listedMultas || !MULTAS.some((multa) => multa.id === multaId)) {
          throw new ToolFailure(404, 'NOT_FOUND', 'Multa não encontrada. Liste as multas antes.');
        }
        const multa = MULTAS.find((item) => item.id === multaId);
        await step('validando_multa');
        await step('calculando_desconto_sne');
        await step('gerando_pagamento', { pix: true, boleto: true });
        await step('preparando_pdf');
        const valor = brl(multa?.valorComDesconto ?? multa?.valor ?? 0);
        const pix = '00020101021226800014br.gov.bcb.pix0136mock-guia-multa5204000053039865802BR5908DETRANSP6009SAOPAULO62070503***6304ABCD';
        const linha = '34191.75462 24615.781234 41234.510000 3 83840000003090';
        const guia: Guia = {
          multaId,
          linhaDigitavel: linha,
          pixCopiaECola: pix,
          textoCompartilhar: `Multa: ${multa?.descricao}\nValor: ${valor}\nBoleto: ${linha}\nPix copia e cola:\n${pix}`,
          pdfFileId: storeFile(session),
        };
        return guia;
      }
      case 'consultar_veiculos':
        requireLogin(session);
        await step('carregando_mock', { quantidade: VEICULOS.length });
        await step('preparando_crlv', { quantidade: VEICULOS.length });
        return { veiculos: VEICULOS.map((veiculo) => ({ ...veiculo, crlvFileId: storeFile(session) })) };
    }
  };

  const fetchImpl: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://mock.local');
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const path = url.pathname;

    if (path === '/health') return json(200, { ok: true, mock: true });
    const share = path.match(/^\/s\/([^/]+)$/);
    if (share && method === 'GET') {
      const link = shared.get(share[1] ?? '');
      const body = link && link.expiresAt > Date.now() ? files.get(link.fileId) : undefined;
      if (!body) return new Response(null, { status: 404 });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/pdf' } });
    }
    if (path === '/session' && method === 'POST') {
      const id = randomId();
      sessions.set(id, { token: randomId(), loggedIn: false, listedMultas: false, files: new Set(), listeners: new Set() });
      return json(200, { id, token: sessions.get(id)?.token });
    }

    const auth = authenticate(headers);
    if (!auth) return json(401, { code: 'UNAUTHORIZED' });
    const [id, session] = auth;

    if (path === '/session' && method === 'DELETE') {
      session.files.forEach((fileId) => files.delete(fileId));
      session.listeners.clear();
      sessions.delete(id);
      return new Response(null, { status: 204 });
    }
    if (path === '/session/state' && method === 'GET') {
      return json(200, {
        uf: session.uf,
        loggedIn: session.loggedIn,
        has: { cnh: false, multas: session.listedMultas, veiculos: false },
        next: { action: session.uf ? (session.loggedIn ? 'done' : 'require_login') : 'ask_uf', reason: 'Mock', source: 'rules' },
      });
    }
    if (path === '/voice/token' && method === 'POST') {
      return json(200, { token: 'mock-voice-token', expiresAt: Math.floor(Date.now() / 1000) + 60, model: 'mock-realtime' });
    }
    const shareRequest = path.match(/^\/files\/([^/]+)\/share$/);
    if (shareRequest && method === 'POST') {
      const fileId = decodeURIComponent(shareRequest[1] ?? '');
      if (!session.files.has(fileId)) return json(404, { code: 'NOT_FOUND' });
      const token = randomId();
      const expiresAt = Date.now() + 15 * 60_000;
      shared.set(token, { fileId, expiresAt });
      const url = `${location.origin}/s/${token}`;
      const texto = `CNH digital de ${CNH.nome}\n${url}\n(link válido por 15 minutos)`;
      return json(200, {
        url,
        expiresAt: new Date(expiresAt).toISOString(),
        texto,
        whatsappUrl: `https://wa.me/?text=${encodeURIComponent(texto)}`,
        emailUrl: `mailto:?subject=${encodeURIComponent('CNH digital')}&body=${encodeURIComponent(texto)}`,
      });
    }
    const file = path.match(/^\/files\/([^/]+)$/);
    if (file && method === 'GET') {
      const fileId = decodeURIComponent(file[1] ?? '');
      const body = session.files.has(fileId) ? files.get(fileId) : undefined;
      if (!body) return json(404, { code: 'NOT_FOUND' });
      return new Response(body, { status: 200, headers: { 'content-type': 'application/pdf' } });
    }
    const tool = path.match(/^\/tools\/([a-z_]+)$/);
    if (tool && method === 'POST') {
      const name = tool[1] as ToolName;
      if (!Object.hasOwn(TOOL_INPUTS, name)) {
        return json(404, { ok: false, code: 'UNKNOWN_TOOL', message: 'Tool desconhecida.' });
      }
      const input = (init.body ? JSON.parse(String(init.body)) : {}) as Record<string, unknown>;
      if (!TOOL_INPUTS[name](input)) return json(400, { ok: false, code: 'INVALID_INPUT', message: 'Entrada inválida.' });
      const service = SERVICES[name];
      const step = async (inner: string, data?: unknown) => {
        emit(id, session, service, inner, 'start', inner === 'aguardando_usuario' ? data : undefined);
        await wait();
        emit(id, session, service, inner, 'ok', inner === 'aguardando_usuario' ? undefined : data);
      };
      emit(id, session, service, name, 'start');
      try {
        const result = await run(name, input, session, step);
        emit(id, session, service, name, 'ok', result);
        return json(200, { ok: true, result });
      } catch (error) {
        if (!(error instanceof ToolFailure)) throw error;
        const next = NEXT[error.code];
        emit(id, session, service, name, 'error', { code: error.code, next });
        return json(error.status, { ok: false, code: error.code, message: error.message, next });
      }
    }
    return json(404, { ok: false, code: 'NOT_FOUND', message: 'Rota desconhecida.' });
  };

  const openEvents: OpenEventStream = (credentials, onEvent) => {
    const session = sessions.get(credentials.id);
    if (session?.token === credentials.token) session.listeners.add(onEvent);
    return {
      ready: Promise.resolve(),
      close: () => session?.listeners.delete(onEvent),
    };
  };

  return { fetch: fetchImpl, openEvents };
}
