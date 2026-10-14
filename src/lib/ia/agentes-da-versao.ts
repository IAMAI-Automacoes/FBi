import type { Area } from '@/lib/areas'
import { SOBRE_A_VERSAO_RH } from '@/lib/prompts-sistema'
import { agenteNaVersao, alcanceDoAgente, blocosDaVersao, type Alcance } from '@/lib/admin-versoes'
import { CATALOGO_AGENTES, type AgenteInfo, type BlocoPrompt } from './catalogo-agentes'
import { paraEmpresa } from '../../../supabase/functions/_shared/prompts-equipe.ts'

/**
 * Os agentes de IA como o painel do admin mostra em cada versão (as regras de
 * o que entra e o que sai estão em lib/admin-versoes.ts).
 *
 * Os parâmetros de um agente (modelo, temperatura, ligado/desligado) são um
 * só para as duas versões; o que muda é o prompt.
 */

export type BlocoDaVersao = BlocoPrompt & { alcance: Alcance }
export interface AgenteDaVersao extends Omit<AgenteInfo, 'blocos'> {
  alcance: Alcance
  blocos: BlocoDaVersao[]
}

/** O bloco que o chat de uma conta RH ganha (prompts-sistema.ts). */
const SOBRE_A_VERSAO_RH_BLOCO: BlocoPrompt = {
  titulo: 'Sobre a versão RH',
  explicacao: 'Só nas contas RH: diz que a conta é de uma empresa (qualquer ramo), que lá não há clientes, QR Code, garçons nem Google, e quais são as páginas.',
  conteudo: SOBRE_A_VERSAO_RH,
  chave: 'sobre_versao_rh',
  editavel: true,
}

/** O que o assistente vê numa conta RH (o contexto montado para a equipe). */
const ACESSOS_DO_ASSISTENTE_NO_RH = [
  'Histórico da conversa atual (todas as mensagens)',
  'Perfil da empresa (nome, ramo, número de funcionários, "Sobre a empresa")',
  'Notas pessoais sobre o dono (campo livre do perfil)',
  'Números do período (satisfação da equipe, volume, tema crítico)',
  'Satisfação por categoria da equipe',
  'Insights e ações do quadro da equipe',
  'Feedbacks recentes dos funcionários (sem o nome de quem não deixou mostrar)',
  'Anotações de conversas anteriores (memória de longo prazo)',
  'Trechos dos materiais de treinamento da base do RH (quando busca no conhecimento)',
  'Resultados da busca na web (quando pesquisa)',
  'Leitura dos arquivos que o dono anexou na conversa',
]

function comBlocoDoRh(blocos: BlocoPrompt[]): BlocoPrompt[] {
  const i = blocos.findIndex((b) => b.chave === 'sobre_equipe')
  return i < 0 ? [...blocos, SOBRE_A_VERSAO_RH_BLOCO] : [...blocos.slice(0, i + 1), SOBRE_A_VERSAO_RH_BLOCO, ...blocos.slice(i + 1)]
}

export function agentesDaVersao(area: Area): AgenteDaVersao[] {
  return CATALOGO_AGENTES.filter((a) => agenteNaVersao(a.id, area)).map((a) => {
    const alcance = alcanceDoAgente(a.id)
    if (area !== 'rh') return { ...a, alcance, blocos: blocosDaVersao(a.blocos, area) }
    return {
      ...a,
      alcance,
      papel: paraEmpresa(a.papel),
      memoria: paraEmpresa(a.memoria),
      acessos: a.id === 'assistente' ? ACESSOS_DO_ASSISTENTE_NO_RH : a.acessos.map(paraEmpresa),
      blocos: blocosDaVersao(a.id === 'assistente' ? comBlocoDoRh(a.blocos) : a.blocos, area),
    }
  })
}
