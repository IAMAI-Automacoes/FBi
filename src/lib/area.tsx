import { useAuth } from '@/hooks/use-auth'
import { areaDe, definicaoDa, type Area, type Vocabulario } from '@/lib/areas'

/**
 * A versão do EasyFeed da conta logada (Restaurante ou RH), para o que muda na
 * tela entre uma e outra: menu, palavras ("restaurante" x "empresa"), perguntas.
 *
 * Sai da conta (`restaurantes.area`), e não do endereço. O endereço continua
 * decidindo outra coisa: de que PÚBLICO são os dados da página (ver
 * `publico.tsx`). Conta de restaurante com a Equipe aberta (admin) tem área
 * 'restaurante' e público 'equipe'; conta RH tem área 'rh' e vive em /equipe.
 *
 * Conta que ainda não escolheu se comporta como restaurante.
 */
export function useArea(): { area: Area; ehRh: boolean } & Vocabulario {
  const { usuario } = useAuth()
  const area = areaDe(usuario?.area) ?? 'restaurante'
  return { area, ehRh: area === 'rh', ...definicaoDa(area).vocabulario }
}
