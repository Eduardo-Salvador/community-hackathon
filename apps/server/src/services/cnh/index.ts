import { z } from 'zod';
import { CnhSchema } from '@hackathon/contracts';
import { findDownloadLink, fetchFile, openSection, pageText, screenshot } from '../../browser/portal.ts';
import { sleep, ToolError } from '../../core/errors.ts';
import { fromPortal } from '../../core/untrusted.ts';
import { defineTool, type ToolContext } from '../../tools/types.ts';

const MOCK_CNH = {
  nome: 'MARIA DA SILVA',
  registro: '01234567890',
  categoria: 'AB',
  validade: '2027-03-15',
  situacao: 'regular',
};

// PDF mínimo válido só para a demo em mock.
const MOCK_PDF = Buffer.from(
  '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
    '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n',
);

// Textos de menu do portal. Confirmar no portal real.
const CNH_SECTION = /condutor|minha cnh|habilita[cç][aã]o/i;
const CNH_DOWNLOAD = /baixar|download|pdf|cnh digital|cnh-e|imprimir/i;

// O que o modelo devolve; depois normalizamos e validamos com o CnhSchema do contrato.
const CnhExtraction = z.object({
  encontrado: z.boolean(),
  nome: z.string(),
  registro: z.string(),
  categoria: z.string(),
  validade: z.string().describe('YYYY-MM-DD'),
  situacao: z.enum(['regular', 'suspensa', 'cassada', 'vencida']),
});

// UF e login já são garantidos pelo orquestrador antes do handler.
function loggedPage({ session, browsers }: ToolContext) {
  const page = browsers.getPage(session.id);
  if (!page) throw new ToolError('LOGIN_REQUIRED', 'Faça login no gov.br primeiro');
  return page;
}

async function consultarReal(ctx: ToolContext) {
  const page = loggedPage(ctx);
  ctx.emit('abrindo_secao_cnh', 'start');
  await openSection(page, CNH_SECTION);
  ctx.emit('abrindo_secao_cnh', 'ok');

  ctx.emit('extraindo_dados', 'start');
  const extracted = await ctx.extractor.extract('cnh', CnhExtraction, await pageText(page));
  if (!extracted.encontrado) throw new ToolError('NOT_FOUND', 'Não encontrei os dados da CNH no portal');
  ctx.emit('extraindo_dados', 'ok');

  return fromPortal('portal-senatran', CnhSchema, {
    nome: extracted.nome.trim(),
    registro: extracted.registro.replace(/\D/g, ''),
    categoria: extracted.categoria.trim().toUpperCase(),
    validade: extracted.validade,
    situacao: extracted.situacao,
  });
}

const cnhTitle = (ctx: ToolContext, label: string) =>
  ctx.session.profile.cnh ? `${label} de ${ctx.session.profile.cnh.nome}` : label;

async function baixarReal(ctx: ToolContext) {
  const page = loggedPage(ctx);
  ctx.emit('baixando_pdf', 'start');
  let href = await findDownloadLink(page, CNH_DOWNLOAD);
  if (!href) {
    await openSection(page, CNH_SECTION).catch(() => {});
    href = await findDownloadLink(page, CNH_DOWNLOAD);
  }
  if (href) {
    const file = await fetchFile(page, href);
    if (file.contentType.includes('pdf')) {
      ctx.emit('baixando_pdf', 'ok');
      const fileId = ctx.files.put(ctx.session.id, {
        contentType: 'application/pdf',
        filename: 'cnh-digital.pdf',
        title: cnhTitle(ctx, 'CNH digital'),
        body: file.body,
      });
      return { fileId, tipo: 'pdf' as const };
    }
  }
  // Sem PDF na web: devolve o print da tela da CNH como comprovante.
  ctx.emit('baixando_pdf', 'error', { code: 'PDF_INDISPONIVEL' });
  ctx.emit('gerando_comprovante', 'start');
  const fileId = ctx.files.put(ctx.session.id, {
    contentType: 'image/png',
    filename: 'comprovante-cnh.png',
    title: cnhTitle(ctx, 'Comprovante da CNH'),
    body: await screenshot(page),
  });
  ctx.emit('gerando_comprovante', 'ok');
  return { fileId, tipo: 'comprovante' as const };
}

export const cnhTools = [
  defineTool({
    name: 'consultar_cnh',
    service: 'cnh',
    description: 'Consulta validade, categoria e situação da CNH do usuário logado.',
    async handler(ctx) {
      let cnh;
      if (ctx.config.mock) {
        ctx.emit('extraindo_dados', 'start');
        await sleep(200);
        cnh = fromPortal('portal-senatran', CnhSchema, MOCK_CNH);
        ctx.emit('extraindo_dados', 'ok');
      } else {
        cnh = await consultarReal(ctx);
      }
      ctx.session.profile.cnh = cnh;
      return cnh;
    },
  }),
  defineTool({
    name: 'baixar_cnh',
    service: 'cnh',
    description:
      'Baixa o PDF da CNH digital do usuário logado. Se o portal não oferecer o PDF, devolve um comprovante (print da tela).',
    async handler(ctx) {
      let result;
      if (ctx.config.mock) {
        ctx.emit('baixando_pdf', 'start');
        await sleep(200);
        const fileId = ctx.files.put(ctx.session.id, {
          contentType: 'application/pdf',
          filename: 'cnh-digital.pdf',
          title: cnhTitle(ctx, 'CNH digital'),
          body: MOCK_PDF,
        });
        ctx.emit('baixando_pdf', 'ok');
        result = { fileId, tipo: 'pdf' as const };
      } else {
        result = await baixarReal(ctx);
      }
      if (ctx.session.profile.cnh) ctx.session.profile.cnh.pdfFileId = result.fileId;
      return result;
    },
  }),
];
