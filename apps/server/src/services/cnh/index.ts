import { CnhSchema } from '@hackathon/contracts';
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

function requireLogin({ session, config }: ToolContext) {
  if (!session.browser?.loggedIn) throw new ToolError('LOGIN_REQUIRED', 'Faça login no gov.br primeiro');
  if (!config.mock) throw new ToolError('NOT_IMPLEMENTED', 'Consulta real da CNH ainda não implementada');
}

export const cnhTools = [
  defineTool({
    name: 'consultar_cnh',
    service: 'cnh',
    description: 'Consulta validade, categoria e situação da CNH do usuário logado.',
    async handler(ctx) {
      requireLogin(ctx);
      ctx.emit('abrindo_portal', 'start');
      await sleep(200);
      ctx.emit('abrindo_portal', 'ok');
      ctx.emit('extraindo_dados', 'start');
      // TODO(A6): extrair do Portal Senatran com Stagehand + Grok.
      const cnh = fromPortal('portal-senatran', CnhSchema, MOCK_CNH);
      ctx.emit('extraindo_dados', 'ok');
      ctx.session.profile.cnh = cnh;
      return cnh;
    },
  }),
  defineTool({
    name: 'baixar_cnh',
    service: 'cnh',
    description: 'Baixa o PDF da CNH digital do usuário logado.',
    async handler(ctx) {
      requireLogin(ctx);
      ctx.emit('baixando_pdf', 'start');
      await sleep(200);
      const fileId = ctx.files.put(ctx.session.id, {
        contentType: 'application/pdf',
        filename: 'cnh-digital.pdf',
        body: MOCK_PDF,
      });
      ctx.emit('baixando_pdf', 'ok');
      if (ctx.session.profile.cnh) ctx.session.profile.cnh.pdfFileId = fileId;
      return { fileId };
    },
  }),
];
