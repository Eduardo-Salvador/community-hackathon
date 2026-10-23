import type { Card } from '../../conversation/store';
import { CnhCard } from './CnhCard';
import { LoginCard } from './LoginCard';
import { MultasCard } from './MultasCard';
import { PixCard, PixConfirm } from './PixCards';
import { UfPicker } from './UfPicker';
import { VeiculoCard } from './VeiculoCard';

export function CardView({ turn, card }: { turn: string; card: Card }) {
  switch (card.type) {
    case 'uf':
      return <UfPicker />;
    case 'login':
      return <LoginCard turn={turn} card={card} />;
    case 'cnh':
      return <CnhCard cnh={card.cnh} />;
    case 'multas':
      return <MultasCard multas={card.multas} resumo={card.resumo} />;
    case 'pixConfirm':
      return <PixConfirm turn={turn} />;
    case 'pix':
      return <PixCard multa={card.multa} guia={card.guia} />;
    case 'veiculo':
      return <VeiculoCard veiculos={card.veiculos} uf={card.uf} />;
  }
}
