import { describe, expect, it } from 'vitest';
import { detectIntent, parseUf } from './intents';

describe('detectIntent', () => {
  it.each([
    ['Minha CNH vence quando?', 'cnh'],
    ['Tenho multa? Quantos pontos eu tenho?', 'multas'],
    ['Gera o Pix da minha multa com desconto', 'pix'],
    ['Meu carro está com IPVA atrasado?', 'veiculo'],
    ['Tem recall no meu carro?', 'veiculo'],
    ['Baixa o PDF da minha CNH', 'baixarCnh'],
  ])('%s → %s', (text, action) => {
    const intent = detectIntent(text);
    expect(intent.type === 'action' && intent.action.type).toBe(action);
  });

  it('reads yes, no and unknown', () => {
    expect(detectIntent('Sim, pode gerar').type).toBe('yes');
    expect(detectIntent('Agora não').type).toBe('no');
    expect(detectIntent('Qual a previsão do tempo?').type).toBe('unknown');
  });
});

describe('parseUf', () => {
  it('reads states by name or code', () => {
    expect(parseUf('sou de São Paulo')).toBe('SP');
    expect(parseUf('Moro em Minas Gerais')).toBe('MG');
    expect(parseUf('RJ')).toBe('RJ');
    expect(parseUf('pa', true)).toBe('PA');
  });

  it('ignores common words that look like state codes', () => {
    expect(parseUf('se eu pagar hoje tem desconto?', true)).toBeUndefined();
    expect(parseUf('pix para a multa')).toBeUndefined();
  });
});
