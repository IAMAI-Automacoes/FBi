import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type KeyboardEvent,
} from 'react'
import { cn } from '@/lib/utils'
import {
  apagarAntesDoNumero,
  colarTelefone,
  coladoValeDistribuir,
  dividirTelefone,
  editarDdd,
  editarNumero,
  paraCanonico,
  type PartesTelefone,
} from '@/lib/telefone'

/**
 * Campo de telefone único do sistema — mesmo componente em QUALQUER lugar que
 * capture um número (telefone do garçom, número de aviso do dono).
 *
 * ## As duas coisas que quebravam as versões anteriores
 *
 * **1. Máscara dentro do texto editável.** Reformatar "(DDD) NÚMERO" a cada
 * tecla troca o `value` do input por fora, e o navegador joga o cursor pro
 * fim toda vez — apagar e editar no meio viravam loteria. Aqui não existe
 * máscara: "55", "(" e ")" são `<span>` fixos, e cada input contém SÓ
 * dígitos. Sem caractere de formatação entrando e saindo do valor, o cursor é
 * 100% nativo, igual a qualquer campo de texto comum.
 *
 * **2. Dois campos fatiados de uma string só.** Se DDD e número forem fatias
 * do mesmo valor, um estado parcial não existe: apagar um dígito do DDD fazia
 * o primeiro dígito do NÚMERO escorregar pra dentro dele, e o campo parecia
 * nunca apagar. Aqui cada pedaço tem estado próprio, e as regras de edição
 * moram em `src/lib/telefone.ts`, cobertas por teste.
 *
 * O "55" nunca é apagável porque não é campo — é texto fixo.
 */
export function CampoTelefone({
  value,
  onChange,
  id,
  className,
  onKeyDown,
}: {
  /** Valor canônico atual: "" ou "55" + DDD + número. */
  value: string
  /**
   * Sempre chamado com o valor já no formato canônico.
   *
   * `temDigitos` diz se o usuário tem ALGUM dígito escrito no campo. Serve
   * pra separar "apaguei tudo, quero remover o número" de "estou no meio de
   * digitar" — nos dois casos o valor canônico é `""` (um DDD incompleto não
   * vira valor guardável, ver `paraCanonico`), e sem esse aviso a tela não
   * teria como saber a diferença.
   */
  onChange: (valorCanonico: string, temDigitos: boolean) => void
  id?: string
  className?: string
  /** Repassado pros dois campos internos — útil pra "Enter salva". */
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
}) {
  const [partes, setPartes] = useState<PartesTelefone>(() => dividirTelefone(value))

  const refDdd = useRef<HTMLInputElement>(null)
  const refNumero = useRef<HTMLInputElement>(null)
  const voltarPraFimDoDdd = useRef(false)

  // Ressincroniza SÓ quando o valor de fora não é o que estes dois campos já
  // representam — ou seja, quando alguém de fora trocou o valor (carregou do
  // banco, abriu outro garçom, limpou o formulário). Durante a digitação o
  // valor de fora é sempre o que este componente acabou de emitir, então nada
  // é sobrescrito no meio do caminho.
  useEffect(() => {
    if (paraCanonico(partes.ddd, partes.numero) === (value ?? '')) return
    setPartes(dividirTelefone(value))
    // `partes` de propósito fora das dependências: o efeito reage a mudança
    // VINDA DE FORA, não à digitação (que já emitiu o valor novo).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Põe o cursor no fim do DDD depois que o DOM já tem o valor novo — usado
  // quando o backspace volta do número pro DDD.
  useLayoutEffect(() => {
    if (!voltarPraFimDoDdd.current) return
    voltarPraFimDoDdd.current = false
    const el = refDdd.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  })

  const aplicar = (novas: PartesTelefone) => {
    setPartes(novas)
    onChange(paraCanonico(novas.ddd, novas.numero), Boolean(novas.ddd || novas.numero))
  }

  const aoMudarDdd = (e: ChangeEvent<HTMLInputElement>) => {
    const novas = editarDdd(partes, e.target.value)
    aplicar(novas)
    // Completou o DDD digitando: pula pro número sozinho. Só quando está
    // CRESCENDO — apagar nunca empurra o foco pra frente.
    if (novas.ddd.length === 2 && partes.ddd.length < 2) refNumero.current?.focus()
  }

  const aoMudarNumero = (e: ChangeEvent<HTMLInputElement>) => {
    aplicar(editarNumero(partes, e.target.value))
  }

  const aoTeclarNumero = (e: KeyboardEvent<HTMLInputElement>) => {
    const noComeco = e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0

    // Backspace com o número já vazio: apaga o último dígito do DDD NA MESMA
    // tecla e leva o cursor pra lá. Cada tecla apaga exatamente um dígito —
    // segurar o backspace limpa tudo sem travar no meio, e para sozinho no
    // "55", que não é campo.
    if (e.key === 'Backspace' && partes.numero === '') {
      e.preventDefault()
      voltarPraFimDoDdd.current = true
      aplicar(apagarAntesDoNumero(partes))
      return
    }
    if (e.key === 'ArrowLeft' && noComeco) {
      // Nada muda de valor, então o DOM já está certo: foca e posiciona
      // direto, sem depender de render nenhum.
      e.preventDefault()
      const el = refDdd.current
      el?.focus()
      el?.setSelectionRange(el.value.length, el.value.length)
      return
    }
    onKeyDown?.(e)
  }

  const aoTeclarDdd = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowRight' && e.currentTarget.selectionStart === partes.ddd.length) {
      e.preventDefault()
      refNumero.current?.focus()
      refNumero.current?.setSelectionRange(0, 0)
      return
    }
    onKeyDown?.(e)
  }

  /** Colar um número inteiro (com ou sem 55, com ou sem máscara) distribui
   *  entre DDD e número em vez de despejar tudo no campo onde o cursor está. */
  const aoColar = (e: ClipboardEvent<HTMLInputElement>) => {
    const texto = e.clipboardData.getData('text')
    if (!coladoValeDistribuir(texto)) return // colagem curta: deixa colar normal
    e.preventDefault()
    aplicar(colarTelefone(texto))
    refNumero.current?.focus()
  }

  const classeInput = 'bg-transparent outline-none placeholder:text-muted-foreground/40'

  return (
    <div
      className={cn(
        'flex h-10 items-center gap-1 rounded-md border border-input bg-background px-3 text-base shadow-sm ' +
          'transition-colors hover:border-muted-foreground/30 focus-within:ring-2 ' +
          'focus-within:ring-primary/20 focus-within:border-primary md:text-sm',
        className,
      )}
      onClick={() => {
        // Clicar no espaço vazio do campo (fora dos inputs) leva pro pedaço
        // que ainda falta preencher.
        const foco = document.activeElement
        if (foco === refDdd.current || foco === refNumero.current) return
        if (partes.ddd.length < 2) refDdd.current?.focus()
        else refNumero.current?.focus()
      }}
    >
      <span className="select-none text-muted-foreground">55</span>
      <span className="select-none text-muted-foreground">(</span>
      <input
        ref={refDdd}
        id={id}
        value={partes.ddd}
        onChange={aoMudarDdd}
        onKeyDown={aoTeclarDdd}
        onPaste={aoColar}
        inputMode="numeric"
        autoComplete="off"
        maxLength={2}
        placeholder="11"
        aria-label="DDD"
        className={cn(classeInput, 'w-[2.2ch] text-center')}
      />
      <span className="select-none text-muted-foreground">)</span>
      <input
        ref={refNumero}
        value={partes.numero}
        onChange={aoMudarNumero}
        onKeyDown={aoTeclarNumero}
        onPaste={aoColar}
        inputMode="numeric"
        autoComplete="off"
        maxLength={9}
        placeholder="987654321"
        aria-label="Número"
        className={cn(classeInput, 'min-w-0 flex-1')}
      />
    </div>
  )
}
