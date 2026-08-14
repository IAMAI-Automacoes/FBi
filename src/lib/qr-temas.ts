// Temas do QR Code e da página do cliente.
// Cada tema = uma FOTO profissional (fundo da página que o cliente abre) + uma
// paleta harmônica (usada no cartaz impresso). Sem emoji e sem "filtros": a
// escolha de um tema já define os dois de forma coerente.
import fotoClassico from '@/assets/qr-temas/classico.jpg'
import fotoModerno from '@/assets/qr-temas/moderno.jpg'
import fotoRustico from '@/assets/qr-temas/rustico.jpg'
import fotoCafe from '@/assets/qr-temas/cafe.jpg'
import fotoJapones from '@/assets/qr-temas/japones.jpg'
import fotoNatural from '@/assets/qr-temas/natural.jpg'

export interface QrTema {
  id: string
  nome: string
  descricao: string
  /** Foto de fundo da página que o cliente abre (retrato, otimizada). */
  foto: string
  /** Cor de marca — botões e detalhes do cartaz impresso. */
  acento: string
  /** Texto sobre a cor de acento (normalmente branco). */
  acentoTexto: string
  /** Gradiente sutil do fundo do cartaz impresso (claro, bom para tinta). */
  posterBg: [string, string]
  /** Texto principal do cartaz. */
  posterTinta: string
  /** Texto secundário do cartaz. */
  posterSuave: string
}

// Os `id` mantêm os nomes antigos (`classico`, `moderno`, ...) para que os
// valores já salvos em `restaurantes.qr_estilo` continuem válidos. Ids
// desconhecidos caem no primeiro tema (getTema).
export const QR_TEMAS: QrTema[] = [
  {
    id: 'classico',
    nome: 'Aconchegante',
    descricao: 'Salão quente e convidativo',
    foto: fotoClassico,
    acento: '#B45309',
    acentoTexto: '#FFFFFF',
    posterBg: ['#FBF6EF', '#F1E4D2'],
    posterTinta: '#2B211A',
    posterSuave: '#8A7660',
  },
  {
    id: 'moderno',
    nome: 'Sofisticado',
    descricao: 'Elegante e contemporâneo',
    foto: fotoModerno,
    acento: '#B8863B',
    acentoTexto: '#FFFFFF',
    posterBg: ['#F6F5F2', '#E7E5DF'],
    posterTinta: '#20262E',
    posterSuave: '#6C737C',
  },
  {
    id: 'rustico',
    nome: 'Caseiro',
    descricao: 'Comida farta e afetiva',
    foto: fotoRustico,
    acento: '#C2410C',
    acentoTexto: '#FFFFFF',
    posterBg: ['#FBF7F0', '#F0E4D2'],
    posterTinta: '#33271B',
    posterSuave: '#8B735A',
  },
  {
    id: 'cafe',
    nome: 'Cafeteria',
    descricao: 'Café e clima de encontro',
    foto: fotoCafe,
    acento: '#8C5A3B',
    acentoTexto: '#FFFFFF',
    posterBg: ['#F6EEE6', '#E7D7C4'],
    posterTinta: '#2E211A',
    posterSuave: '#836A58',
  },
  {
    id: 'japones',
    nome: 'Oriental',
    descricao: 'Culinária asiática e sushi',
    foto: fotoJapones,
    acento: '#B23A2E',
    acentoTexto: '#FFFFFF',
    posterBg: ['#F6F3EE', '#E6DFD4'],
    posterTinta: '#262220',
    posterSuave: '#6F655B',
  },
  {
    id: 'natural',
    nome: 'Natural',
    descricao: 'Saudável, fresco e colorido',
    foto: fotoNatural,
    acento: '#3F7A34',
    acentoTexto: '#FFFFFF',
    posterBg: ['#F3F7ED', '#DFEDD0'],
    posterTinta: '#22331C',
    posterSuave: '#5E7350',
  },
]

const PADRAO = QR_TEMAS[0]

/** Retorna o tema pelo id salvo; se não existir (id antigo), cai no padrão. */
export function getTema(id?: string | null): QrTema {
  return QR_TEMAS.find((t) => t.id === id) ?? PADRAO
}
