import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Gravidade } from '@hackathon/contracts';
import {
  calcularPontos,
  PONTOS_POR_GRAVIDADE,
  type MultaParaCalculo,
} from '../src/domain/pontos/index.ts';

const DATA_REFERENCIA = '2026-10-23';

function multa(id: string, gravidade: Gravidade, data = '2026-06-01'): MultaParaCalculo {
  return {
    id,
    descricao: `Infração ${id}`,
    data,
    local: 'São Paulo, SP',
    gravidade,
    valor: 100,
  };
}

test('calcula os pontos pela gravidade e a saída da janela de doze meses', () => {
  const entrada = [
    multa('leve', 'leve'),
    multa('media', 'media'),
    multa('grave', 'grave'),
    multa('gravissima', 'gravissima'),
  ];

  const resultado = calcularPontos(entrada, true, DATA_REFERENCIA);

  assert.deepEqual(
    resultado.multas.map(({ pontos }) => pontos),
    [3, 4, 5, 7],
  );
  assert.ok(resultado.multas.every(({ expiraContagemEm }) => expiraContagemEm === '2027-06-01'));
  assert.equal(resultado.pontos.total, 19);
  assert.deepEqual(entrada, [
    multa('leve', 'leve'),
    multa('media', 'media'),
    multa('grave', 'grave'),
    multa('gravissima', 'gravissima'),
  ]);
  assert.deepEqual(PONTOS_POR_GRAVIDADE, { leve: 3, media: 4, grave: 5, gravissima: 7 });
});

test('aplica limites 40, 30 e 20 conforme as gravíssimas ativas', () => {
  assert.equal(calcularPontos([multa('m1', 'media')], false, DATA_REFERENCIA).pontos.limite, 40);
  assert.equal(calcularPontos([multa('g1', 'gravissima')], false, DATA_REFERENCIA).pontos.limite, 30);
  assert.equal(
    calcularPontos([multa('g1', 'gravissima'), multa('g2', 'gravissima')], false, DATA_REFERENCIA).pontos.limite,
    20,
  );
});

test('EAR mantém o limite em 40 mesmo com infrações gravíssimas', () => {
  const resultado = calcularPontos(
    [multa('g1', 'gravissima'), multa('g2', 'gravissima')],
    true,
    DATA_REFERENCIA,
  );
  assert.equal(resultado.pontos.limite, 40);
});

test('multas expiradas permanecem na saída, mas não entram no total ou no limite', () => {
  const resultado = calcularPontos(
    [multa('expirada', 'gravissima', '2025-10-23'), multa('ativa', 'grave')],
    false,
    DATA_REFERENCIA,
  );

  assert.equal(resultado.multas[0]?.expiraContagemEm, DATA_REFERENCIA);
  assert.equal(resultado.pontos.total, 5);
  assert.equal(resultado.pontos.limite, 40);
});

test('classifica corretamente os limites exatos das faixas de alerta', () => {
  const calcularAlerta = (gravidades: Gravidade[]) =>
    calcularPontos(
      gravidades.map((gravidade, indice) => multa(String(indice), gravidade)),
      true,
      DATA_REFERENCIA,
    ).pontos.alerta;

  assert.equal(calcularAlerta(['gravissima', 'grave', 'media', 'leve']), 'verde'); // 19/40
  assert.equal(calcularAlerta(['gravissima', 'grave', 'grave', 'leve']), 'amarelo'); // 20/40
  assert.equal(
    calcularAlerta(['gravissima', 'grave', 'grave', 'grave', 'grave', 'grave']),
    'amarelo', // 32/40
  );
  assert.equal(
    calcularAlerta(['gravissima', 'grave', 'grave', 'grave', 'grave', 'leve', 'leve']),
    'vermelho', // 33/40
  );
});

test('ajusta a expiração de 29 de fevereiro e exclui no dia da expiração', () => {
  const antes = calcularPontos([multa('bissexto', 'leve', '2024-02-29')], false, '2025-02-27');
  const noDia = calcularPontos([multa('bissexto', 'leve', '2024-02-29')], false, '2025-02-28');

  assert.equal(antes.multas[0]?.expiraContagemEm, '2025-02-28');
  assert.equal(antes.pontos.total, 3);
  assert.equal(noDia.pontos.total, 0);
});

test('sem multas retorna total zero, limite 40 e alerta verde', () => {
  assert.deepEqual(calcularPontos([], false, DATA_REFERENCIA), {
    multas: [],
    pontos: { total: 0, limite: 40, alerta: 'verde' },
  });
});

test('rejeita datas inexistentes e multas com data futura', () => {
  assert.throws(() => calcularPontos([multa('invalida', 'leve', '2026-02-30')], false, DATA_REFERENCIA), TypeError);
  assert.throws(() => calcularPontos([multa('futura', 'leve', '2026-10-24')], false, DATA_REFERENCIA), RangeError);
  assert.throws(() => calcularPontos([], false, '23/10/2026'), TypeError);
});
