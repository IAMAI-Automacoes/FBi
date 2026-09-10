/**
 * Convenção única de telefone do sistema: guardado como "55" + DDD + número
 * (só dígitos, sem máscara), exibido como "55 (DDD) NÚMERO" — o "55" é fixo
 * e nunca editável (o produto só atende restaurante no Brasil), então nem
 * entra como texto digitável em lugar nenhum.
 *
 * Usado tanto no telefone do garçom (`garcons.telefone`) quanto no número de
 * aviso do dono (`restaurantes.whatsapp_dono`) — as duas coisas são a MESMA
 * ideia (um número de WhatsApp de alguém), então usam a mesma convenção de
 * armazenamento/validação em vez de cada tela inventar a própria regra.
 *
 * ## Por que a EDIÇÃO mora aqui, e não dentro do componente
 *
 * As duas versões anteriores do campo tinham bug de apagar, e nenhum deles
 * era de layout: eram de lógica de estado (dígito do número escorregando pro
 * DDD, "55" vazando pro campo do DDD). Lógica de estado dá pra testar; JSX
 * com cursor e foco, não. Então tudo o que decide "o que vira o quê quando o
 * usuário digita, apaga ou cola" está aqui, coberto por teste, e o
 * componente é só a casca que liga isso aos dois `<input>`.
 */

/** DDD (2) + número (8 ou 9). O limite existe pra qualquer entrada crua
 *  (digitada ou colada) nunca virar um número maior que o possível. */
const MAX_NACIONAIS = 11
const MAX_DDD = 2
const MAX_NUMERO = 9

/** Os dois pedaços editáveis do campo. O "55" não entra: é fixo na tela. */
export interface PartesTelefone {
  ddd: string
  numero: string
}

const soDigitos = (texto: string) => (texto ?? '').replace(/\D/g, '')

/**
 * Dígitos nacionais de um texto de origem DESCONHECIDA (o que a pessoa
 * colou): pode vir com ou sem o "55" do país, com ou sem máscara.
 *
 * Aqui o "55" da frente só é removido quando sobra mais dígito do que cabe
 * num número nacional (12 ou 13 = tem código de país junto). Um número de 11
 * dígitos que POR ACASO começa com 55 é DDD 55 de verdade (Santa Maria, RS)
 * e é preservado — sem saber a origem, é o palpite certo.
 */
export function paraDigitosNacionais(valor: string | null | undefined): string {
  const d = soDigitos(valor ?? '')
  const semPais = d.startsWith('55') && d.length > MAX_NACIONAIS ? d.slice(2) : d
  return semPais.slice(0, MAX_NACIONAIS)
}

/**
 * Separa um valor GUARDADO POR NÓS nos dois pedaços que a tela edita.
 *
 * Diferente do caso de colar: aqui a origem é conhecida — `paraCanonico`
 * sempre grava "55" + nacionais —, então o "55" da frente é código de país
 * SEMPRE, e sai sem adivinhação. É isso que faz "5555991234567" (DDD 55) e
 * "5511" (só o DDD digitado até agora) serem lidos certo, coisa que um
 * palpite por tamanho erraria.
 */
export function dividirTelefone(valor: string | null | undefined): PartesTelefone {
  const d = soDigitos(valor ?? '')
  const nacionais = (d.startsWith('55') ? d.slice(2) : d).slice(0, MAX_NACIONAIS)
  return { ddd: nacionais.slice(0, MAX_DDD), numero: nacionais.slice(MAX_DDD) }
}

/**
 * DDD + número → valor canônico pronto pra guardar e mandar pro WhatsApp:
 * sempre "55" + DDD (2) + número (até 9), ou `""`.
 *
 * Com DDD incompleto o resultado é `""` de propósito. Não é frescura: sem
 * garantir os 2 dígitos de DDD, "55991234567" poderia significar tanto
 * "DDD 99, número 1234567" quanto "sem DDD, número 991234567" — e a leitura
 * de volta teria que adivinhar. Exigindo o DDD completo, todo valor guardado
 * tem exatamente a mesma forma e `dividirTelefone` nunca erra. Um telefone
 * sem DDD não é um telefone válido de qualquer jeito.
 */
export function paraCanonico(ddd: string, numero: string): string {
  const dddLimpo = soDigitos(ddd).slice(0, MAX_DDD)
  if (dddLimpo.length < MAX_DDD) return ''
  return `55${dddLimpo}${soDigitos(numero).slice(0, MAX_NUMERO)}`
}

/**
 * O usuário mexeu no campo do DDD (digitou, apagou, colou por cima).
 *
 * O NÚMERO fica exatamente como estava. É esta separação que conserta o bug
 * antigo: quando os dois eram fatias de uma string só, apagar um dígito do
 * DDD puxava o primeiro dígito do número pra dentro dele, e o campo parecia
 * não apagar nunca.
 */
export function editarDdd(partes: PartesTelefone, textoDigitado: string): PartesTelefone {
  return { ddd: soDigitos(textoDigitado).slice(0, MAX_DDD), numero: partes.numero }
}

/** O usuário mexeu no campo do número. O DDD fica como estava. */
export function editarNumero(partes: PartesTelefone, textoDigitado: string): PartesTelefone {
  return { ddd: partes.ddd, numero: soDigitos(textoDigitado).slice(0, MAX_NUMERO) }
}

/**
 * Backspace com o campo do número JÁ vazio: apaga o último dígito do DDD na
 * mesma tecla. Cada tecla apaga exatamente um dígito, então segurar o
 * backspace limpa tudo sem travar no meio — e para sozinho quando o DDD
 * acaba, porque o "55" não é campo.
 */
export function apagarAntesDoNumero(partes: PartesTelefone): PartesTelefone {
  return { ddd: partes.ddd.slice(0, -1), numero: '' }
}

/** Colar um número inteiro (com ou sem 55, com ou sem máscara) distribui
 *  entre DDD e número em vez de despejar tudo num campo só. */
export function colarTelefone(textoColado: string): PartesTelefone {
  const nac = paraDigitosNacionais(textoColado)
  return { ddd: nac.slice(0, MAX_DDD), numero: nac.slice(MAX_DDD) }
}

/** Vale a pena distribuir o que foi colado entre os dois campos? Colagem
 *  curta (1 ou 2 dígitos) é edição pontual — deixa o navegador colar normal
 *  no campo onde o cursor está. */
export function coladoValeDistribuir(textoColado: string): boolean {
  return soDigitos(textoColado).length >= 3
}

/** Só pra EXIBIÇÃO em texto corrido (fora de campo editável) — ex.: o painel
 *  de detalhes do garçom. */
export function formatarExibicaoTelefone(valor: string | null | undefined): string {
  const { ddd, numero } = dividirTelefone(valor)
  if (!ddd) return ''
  return numero ? `55 (${ddd}) ${numero}` : `55 (${ddd})`
}

/** Um telefone nacional válido tem DDD + 8 dígitos (fixo) ou DDD + 9
 *  (celular) — 10 ou 11 dígitos no total, nunca menos nem mais. */
export function telefoneNacionalValido(valor: string | null | undefined): boolean {
  const { ddd, numero } = dividirTelefone(valor)
  const total = ddd.length + numero.length
  return total === 10 || total === 11
}
