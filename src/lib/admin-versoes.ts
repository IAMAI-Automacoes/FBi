import { areaDe, type Area } from './areas.ts'

/**
 * O painel do admin nas duas versões do EasyFeed (Restaurante e RH).
 *
 * Decisão do Raver (14/10/2026): o painel do admin segue a versão da conta do
 * próprio admin, a mesma troca Restaurante | RH do menu do cliente. Há três
 * tipos de coisa no painel:
 *   - o que controla as DUAS versões ao mesmo tempo continua igual nas duas
 *     (pagamentos, cupons, afiliados, vídeos, modelos de IA, parâmetros de cada
 *     agente, o convite do RH e a troca de versão de uma conta);
 *   - o que é de UMA conta mostra só as contas da versão na tela (suporte,
 *     WhatsApp, contas, uso de IA);
 *   - o que só existe numa versão some da outra (vendedores, influenciadores e
 *     o motor de resposta aos clientes são do restaurante; o aviso de ação
 *     concluída para a equipe é do RH). A base de conhecimento e os prompts
 *     têm uma versão para cada lado.
 *
 * Sem React, para os testes rodarem no Node.
 */

export type AbaAdmin =
  | 'suporte' | 'whatsapp' | 'contas' | 'vendedores' | 'influenciadores' | 'videos' | 'pagamentos' | 'cupons'
  | 'afiliados' | 'agentes' | 'conhecimento' | 'uso_ia' | 'motor' | 'acompanhamento'

/** Todas as abas, na ordem do menu. */
export const TODAS_AS_ABAS: readonly AbaAdmin[] = [
  'suporte', 'whatsapp', 'contas', 'vendedores', 'influenciadores', 'videos', 'pagamentos', 'cupons',
  'afiliados', 'agentes', 'conhecimento', 'uso_ia', 'motor', 'acompanhamento',
]

/**
 * Abas que só existem no Restaurante: vendedores (demonstração do produto de
 * restaurante), EasyFeed Influencers, o motor de resposta (o aviso aos
 * CLIENTES quando o problema deles foi resolvido; no RH o aviso à equipe é
 * outro, e o dono revisa antes de mandar) e Acompanhamento (a evolução da
 * satisfação dos CLIENTES de cada restaurante, para o marketing).
 */
const SO_NO_RESTAURANTE: ReadonlySet<AbaAdmin> = new Set(['vendedores', 'influenciadores', 'motor', 'acompanhamento'])

/**
 * O admin parceiro (decisão do Raver, 16/10/2026: só o Anderson) vê três abas,
 * e só na versão Restaurante: Suporte e WhatsApp como qualquer admin, e Contas
 * para ver e entrar nas contas (sem excluir, restaurar ou trocar a versão).
 */
export const ABAS_DO_PARCEIRO: readonly AbaAdmin[] = ['suporte', 'whatsapp', 'contas']

export function abasDaVersao(area: Area, parceiro = false): AbaAdmin[] {
  if (parceiro) return area === 'restaurante' ? [...ABAS_DO_PARCEIRO] : []
  return TODAS_AS_ABAS.filter((a) => area === 'restaurante' || !SO_NO_RESTAURANTE.has(a))
}

/** A aba pedida (pelo endereço, por exemplo), se ela existir nesta versão; senão, a padrão. */
export function abaDaVersao(pedida: unknown, area: Area, padrao: AbaAdmin = 'suporte', parceiro = false): AbaAdmin {
  return abasDaVersao(area, parceiro).includes(pedida as AbaAdmin) ? (pedida as AbaAdmin) : padrao
}

/** A versão de uma conta para o painel: conta que ainda não escolheu conta como restaurante. */
export const versaoDaConta = (v: unknown): Area => areaDe(v) ?? 'restaurante'

/** Só os itens das contas desta versão. */
export function daVersao<T>(itens: readonly T[], area: Area, areaDoItem: (t: T) => unknown): T[] {
  return itens.filter((t) => versaoDaConta(areaDoItem(t)) === area)
}

// ── Agentes de IA ────────────────────────────────────────────────────────────

/** Onde um agente ou um prompt vale. */
export type Alcance = 'as_duas' | Area

export const ROTULO_DO_ALCANCE: Record<Alcance, string> = {
  as_duas: 'Vale para as duas versões',
  restaurante: 'Só Restaurante',
  rh: 'Só RH',
}

/**
 * Agentes que só trabalham numa versão. Todos os outros (o chat inteiro, o
 * motor que lê os feedbacks e os relatórios) trabalham nas duas, e o que muda
 * entre elas é o prompt: os do motor têm um irmão `…_equipe`.
 */
const AGENTES_SO_DO_RESTAURANTE: ReadonlySet<string> = new Set([
  'perguntas_direcionadas', // perguntas para os clientes medirem uma ação
  'banner', // o banner do dia sai dos feedbacks dos clientes
])
const AGENTES_SO_DO_RH: ReadonlySet<string> = new Set([
  'aviso_equipe', // o aviso de ação concluída para os funcionários
])

export function alcanceDoAgente(id: string): Alcance {
  if (AGENTES_SO_DO_RESTAURANTE.has(id)) return 'restaurante'
  if (AGENTES_SO_DO_RH.has(id)) return 'rh'
  return 'as_duas'
}

export const agenteNaVersao = (id: string, area: Area): boolean => {
  const a = alcanceDoAgente(id)
  return a === 'as_duas' || a === area
}

/** Prompts do chat que só entram quando a conversa é sobre os funcionários. */
const PROMPTS_SO_DO_RH: ReadonlySet<string> = new Set(['sobre_equipe', 'sobre_versao_rh'])

export const EXPLICACAO_DO_PROMPT_DO_RH =
  'É este o prompt que a versão RH usa: lá o feedback é sempre de funcionário. Na hora de usar, o sistema troca '
  + '"restaurante" por "empresa" e junta o ramo e o perfil da empresa. Vale também para a Equipe aberta numa conta '
  + 'de restaurante (só o admin usa).'

interface BlocoComChave { chave?: string; titulo: string; explicacao: string }

/**
 * Os prompts de um agente na versão da tela, cada um com o seu alcance:
 *   - `X_equipe` ao lado de um `X` (e os do chat da equipe): só RH;
 *   - `X` que tem um irmão `X_equipe`: só Restaurante (o RH usa o irmão);
 *   - o resto: vale para as duas (editar muda as duas).
 * No RH, o prompt da equipe perde o "da EQUIPE" do título (lá tudo é da equipe).
 */
export function blocosDaVersao<B extends BlocoComChave>(blocos: readonly B[], area: Area): Array<B & { alcance: Alcance }> {
  const chaves = new Set(blocos.map((b) => b.chave).filter(Boolean))
  // O irmão da equipe de um prompt de cliente (`ef_x` → `ef_x_equipe`).
  const ehIrmaoDaEquipe = (b: B) => !!b.chave?.endsWith('_equipe') && chaves.has(b.chave.slice(0, -'_equipe'.length))
  const alcance = (b: B): Alcance => {
    if (!b.chave) return 'as_duas'
    if (ehIrmaoDaEquipe(b) || PROMPTS_SO_DO_RH.has(b.chave)) return 'rh'
    if (chaves.has(`${b.chave}_equipe`)) return 'restaurante'
    return 'as_duas'
  }
  return blocos
    .map((b) => ({ ...b, alcance: alcance(b) }))
    .filter((b) => b.alcance === 'as_duas' || b.alcance === area)
    .map((b) => (area === 'rh' && ehIrmaoDaEquipe(b)
      ? { ...b, titulo: b.titulo.replace(/ da EQUIPE$/, ''), explicacao: EXPLICACAO_DO_PROMPT_DO_RH }
      : b))
}
