import { useState, useRef, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { enviarMensagemComFontes, ChatMessage, FonteWeb, ErroIA } from '@/lib/openrouter'
import { paramsDoAgente } from '@/lib/ia/params'
import { buscarUsoCiclo, UsoCiclo } from '@/lib/queries/uso-ia'
import { construirSystemPromptChef } from '@/lib/prompts-sistema'
import { memorizarDaConversa, FatoMemoria } from '@/lib/queries/memoria-assistente'
import { buscarConhecimento, extrairTextoDeUrl as lerPagina } from '@/lib/queries/conhecimento'
import { AcaoAgente, ACOES_DESTRUTIVAS } from '@/lib/queries/agente-ia'
import {
  despacharOperacao, narrarOperacao, relatorioDaAcao,
  analisarDocumentos, blocoDeAnalises, AnaliseArquivo,
  pesquisarNaWeb, lerPaginaWeb, curarConhecimento,
} from '@/lib/ia/agentes'
import { parsearComando, removerComandos, ehComandoMaterial } from '@/lib/ia/comandos'

export interface AtualizacaoConfig {
  campo: string
  valor: string
  rotulo: string
}

export interface AnexoMensagem {
  nome: string
  tipo: 'imagem' | 'pdf' | 'texto'
  url?: string
  texto?: string
}

export interface MensagemChat {
  id?: string
  /** Identificador local e estável — não muda se a lista for reordenada ou
   *  recarregada. A posição no array (índice) mudaria e apontaria para a
   *  mensagem errada. */
  uid: string
  role: 'user' | 'assistant'
  text: string
  /** Anexos da mensagem (imagens, PDFs e textos) */
  anexos?: AnexoMensagem[]
  fontes?: FonteWeb[]
  /** Alterações aplicadas a partir desta resposta (marca de "feito") */
  registros?: { id: string; descricao: string }[]
  /** Alteração proposta por esta resposta, aguardando o dono confirmar */
  proposta?: AcaoAgente | null
  /**
   * Quando a proposta foi aceita, guarda o registro gerado. O botão da proposta
   * NÃO some: com isto vira o estado "aceita" (verde). Desfazer volta para null
   * (botão azul de novo), mas o botão permanece sempre no chat.
   */
  propostaRegistro?: { id: string; descricao: string } | null
  /** Leitura dos arquivos desta mensagem, feita por um agente sem memória */
  analises?: AnaliseArquivo[]
  /** Mensagem que esta responde — fica visível na bolha, como no WhatsApp */
  respondendoA?: { uid: string; autor: 'user' | 'assistant'; texto: string }
}

export interface ResultadoEnvio {
  error?: string
  /** Alteração que o agente quer executar (ou já executou, no modo automático) */
  acao?: AcaoAgente | null
  /** Perguntas que a IA quer fazer antes de agir */
}

export function useChat(contextoPagina: string, contextoDadosIniciais: any = {}) {
  const [messages, setMessages] = useState<MensagemChat[]>([])
  const [loading, setLoading] = useState(false)
  const [buscandoWeb, setBuscandoWeb] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Crédito do ciclo: alimenta a barra e trava o envio quando acaba
  const [uso, setUso] = useState<UsoCiclo | null>(null)
  const [creditoEsgotado, setCreditoEsgotado] = useState(false)
  // Espelha o state para o envio não depender de um render acontecer antes
  const messagesRef = useRef<MensagemChat[]>([])
  // Trava recargas de histórico enquanto há um envio em andamento
  const enviandoRef = useRef(false)
  // Índice das leituras de arquivo já feitas nesta conversa
  const analisesRef = useRef<AnaliseArquivo[]>([])

  const aplicar = useCallback((fn: (prev: MensagemChat[]) => MensagemChat[]) => {
    const novo = fn(messagesRef.current)
    messagesRef.current = novo
    setMessages(novo)
    return novo
  }, [])

  const [sessaoId, setSessaoId] = useState(() => {
    const saved = localStorage.getItem('chat_sessao_id')
    const savedTime = localStorage.getItem('chat_sessao_time')
    if (saved && savedTime && Date.now() - parseInt(savedTime) < 24 * 60 * 60 * 1000) {
      return saved
    }
    const newId = crypto.randomUUID()
    localStorage.setItem('chat_sessao_id', newId)
    localStorage.setItem('chat_sessao_time', Date.now().toString())
    return newId
  })

  /**
   * Coloca a mensagem do usuário na tela IMEDIATAMENTE, antes de qualquer
   * chamada de rede. Devolve o histórico já com ela para o envio usar.
   */
  const novoUid = () => `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  const adicionarMensagemUsuario = useCallback(
    (
      texto: string,
      anexos?: AnexoMensagem[],
      respondendoA?: MensagemChat['respondendoA'],
    ) =>
      aplicar((prev) => [...prev, { uid: novoUid(), role: 'user', text: texto, anexos, respondendoA }]),
    [aplicar],
  )

  /**
   * IMPORTANTE: precisa ser estável (useCallback). Sem isso, um efeito que a
   * tenha como dependência dispara a cada render e recarrega o histórico do
   * banco por cima das mensagens locais — apagando a mensagem recém-enviada
   * e a resposta da IA antes delas terem sido gravadas.
   */
  const carregarHistorico = useCallback(
    async (id: string) => {
      // Não sobrescreve o que está na tela durante um envio em andamento
      if (enviandoRef.current) return

      const { data } = await supabase
        .from('mensagens_chat')
        .select('*')
        .eq('sessao_id', id)
        .order('created_at', { ascending: true })

      if (data && !enviandoRef.current) {
        aplicar(() =>
          data.map((m) => ({
            id: m.id,
            uid: m.id,
            role: m.papel === 'usuario' ? ('user' as const) : ('assistant' as const),
            text: m.mensagem,
            // anexos ficam em contexto_dados (o schema de mensagens_chat não muda);
            // o formato antigo guardava só { imagem }
            anexos:
              (m.contexto_dados as any)?.anexos ||
              ((m.contexto_dados as any)?.imagem
                ? [{ nome: 'imagem', tipo: 'imagem', url: (m.contexto_dados as any).imagem }]
                : undefined),
            respondendoA: (m.contexto_dados as any)?.respondendoA || undefined,
          })),
        )
      }
    },
    [aplicar],
  )

  const enviar = async (
    texto: string,
    contextoDadosAdicionais: any = {},
    systemMessageOverride?: string,
    anexos?: AnexoMensagem[],
    opcoes: {
      jaExibida?: boolean
      memoria?: FatoMemoria[]
      /** 'automatico' aplica na hora; 'perguntar' propõe. Muda a narração. */
      modoAcao?: 'automatico' | 'perguntar'
      respondendoA?: MensagemChat['respondendoA']
    } = {},
  ): Promise<ResultadoEnvio> => {
    enviandoRef.current = true
    setLoading(true)
    setError(null)

    // Se a UI já exibiu a mensagem (caminho normal), não duplica
    let currentMessages = messagesRef.current
    if (!opcoes.jaExibida && (texto || anexos?.length)) {
      currentMessages = adicionarMensagemUsuario(texto, anexos)
    }

    try {
      const contextoFinal = { ...contextoDadosIniciais, ...contextoDadosAdicionais }
      const nomeAssistente = () =>
        (contextoFinal?.mascote_config?.nome || '').trim() || 'Chef Pepê'

      // ── Pré-passo: ler arquivos anexados (cada um isolado, sem histórico) ──
      const temArquivos = !!contextoFinal.arquivos?.length
      if (temArquivos) {
        const analises = await analisarDocumentos(contextoFinal.arquivos)
        if (analises.length) {
          const anteriores = analisesRef.current
          analisesRef.current = [...anteriores, ...analises]
          contextoFinal.analiseArquivos = blocoDeAnalises(analises, anteriores)
        }
      } else if (analisesRef.current.length) {
        contextoFinal.analiseArquivos = blocoDeAnalises([], analisesRef.current)
      }

      // Monta as mensagens da API a partir de um system prompt + o histórico
      const montarMensagens = (sysPrompt: string): ChatMessage[] => [
        { role: 'system', content: sysPrompt },
        ...currentMessages.map((m): ChatMessage => {
          const imagens = (m.anexos || []).filter((a) => a.tipo === 'imagem' && a.url)
          if (imagens.length) {
            return {
              role: m.role,
              content: [
                ...imagens.map((a) => ({
                  type: 'image_url' as const,
                  image_url: { url: a.url!, detail: 'low' as const },
                })),
                ...(m.text ? [{ type: 'text' as const, text: m.text }] : []),
              ],
            }
          }
          return { role: m.role, content: m.text }
        }),
      ]

      // Mostra uma resposta da IA, persiste no banco e grava a memória.
      const mostrarEPersistir = async (resposta: string, fontes: FonteWeb[] = []) => {
        aplicar((prev) => [...prev, { uid: novoUid(), role: 'assistant', text: resposta, fontes }])
        setLoading(false)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          if (texto || anexos?.length) {
            await supabase.from('mensagens_chat').insert({
              usuario_id: user.id,
              sessao_id: sessaoId,
              mensagem: texto,
              papel: 'usuario',
              contexto_pagina: contextoPagina,
              contexto_dados: {
                anexos: (anexos || []).map((a) => ({ nome: a.nome, tipo: a.tipo, url: a.url ?? null })),
                respondendoA: opcoes.respondendoA ?? null,
              },
            })
          }
          await supabase.from('mensagens_chat').insert({
            usuario_id: user.id,
            sessao_id: sessaoId,
            mensagem: resposta,
            papel: 'assistente',
            contexto_pagina: contextoPagina,
            contexto_dados: {},
          })
        }
        if (texto) {
          // A IA aprende em segundo plano na SUA memória própria
          // (`memoria_assistente`). Os campos de texto livre do usuário
          // (`perfil_notas`, `detalhes`) são só dele — a IA não escreve neles.
          void memorizarDaConversa(
            contextoFinal.restaurante_id ?? null,
            texto,
            resposta,
            opcoes.memoria ?? contextoFinal.memoria ?? [],
          )
        }
      }

      // ══ FASE 1: a IA principal decide — responde em texto OU emite um comando ══
      const sysPrompt1 =
        systemMessageOverride ||
        construirSystemPromptChef(contextoFinal.mascote_config, contextoFinal, {})
      // temperatura 0: a decisão de emitir (ou não) um comando precisa ser
      // determinística — testado 16/16 casos. A prosa da busca vem na fase 2.
      const resposta1 = (
        await enviarMensagemComFontes(
          montarMensagens(sysPrompt1),
          paramsDoAgente('assistente', { temperature: 0 }),
          'assistente',
        )
      ).texto

      // Override (ex.: análise inicial do AiChatSheet) não usa comandos
      const cmd = texto && !systemMessageOverride ? parsearComando(resposta1) : null

      // ── Sem comando: a resposta da fase 1 já é a resposta final ──
      if (!cmd) {
        const limpa = removerComandos(resposta1) || 'Desculpe, pode reformular?'
        await mostrarEPersistir(limpa)
        return {}
      }

      // ── Comando de BUSCA: o sistema apura os fatos e a IA escreve com eles ──
      if (ehComandoMaterial(cmd.tipo)) {
        let fontes: FonteWeb[] = []
        if (cmd.tipo === 'pesquisar' || cmd.tipo === 'abrir') setBuscandoWeb(true)
        try {
          if (cmd.tipo === 'pesquisar') {
            const p = await pesquisarNaWeb(cmd.arg || texto)
            if (p) { contextoFinal.pesquisaWeb = p.resumo; fontes = p.fontes }
          } else if (cmd.tipo === 'abrir') {
            const p = await lerPaginaWeb(cmd.arg, lerPagina)
            if (p) { contextoFinal.pesquisaWeb = p.resumo; fontes = p.fontes }
          } else {
            const trechos = await buscarConhecimento(cmd.arg || texto, 6)
            if (trechos.length) {
              contextoFinal.conhecimento = await curarConhecimento(
                cmd.arg || texto,
                trechos.map((t) => ({ conteudo: t.conteudo, titulo: t.titulo })),
              )
            }
          }
        } finally {
          setBuscandoWeb(false)
        }
        const web = cmd.tipo === 'pesquisar' || cmd.tipo === 'abrir'
        const sysPrompt2 = construirSystemPromptChef(contextoFinal.mascote_config, contextoFinal, {
          jaBuscou: web,
          semComandos: true,
        })
        const resposta2 = (
          await enviarMensagemComFontes(
            montarMensagens(sysPrompt2),
            paramsDoAgente('assistente'),
            'assistente',
          )
        ).texto
        await mostrarEPersistir(removerComandos(resposta2) || resposta2, fontes)
        return {}
      }

      // ── Comando de OPERAÇÃO/FORMULÁRIO: chama o especialista e narra ──
      const resultado = await despacharOperacao(cmd, {
        configAtual: contextoFinal.configAtual || {},
      })


      // Especialista não conseguiu montar (ex.: item não encontrado)
      if (!resultado.acao) {
        const narr = await narrarOperacao(
          nomeAssistente(),
          'A alteração pedida não pôde ser identificada com o que existe no sistema.',
          'a alteração pedida',
          'falhou',
        )
        await mostrarEPersistir(narr)
        return {}
      }

      // Ação montada: narra conforme o modo (aplicado x preparado) e devolve
      const acao = resultado.acao
      const destrutiva = ACOES_DESTRUTIVAS.includes(acao.tipo)
      const vaiAplicar = opcoes.modoAcao === 'automatico' && !destrutiva
      const narr = await narrarOperacao(
        nomeAssistente(),
        relatorioDaAcao(acao),
        acao.descricao,
        vaiAplicar ? 'aplicado' : 'preparado',
      )
      await mostrarEPersistir(narr)
      return { acao }
    } catch (err: any) {
      // Crédito esgotado e assinatura inativa não são falha técnica: viram
      // resposta na conversa, com o motivo, em vez de um erro vermelho.
      if (err instanceof ErroIA && (err.codigo === 'sem_credito' || err.codigo === 'sem_assinatura')) {
        const texto =
          err.codigo === 'sem_credito'
            ? `Você usou todo o crédito de IA deste ciclo${
                err.detalhes?.limite ? ` (US$ ${err.detalhes.limite.toFixed(2)})` : ''
              }. Ele é renovado junto com a assinatura.`
            : 'Sua assinatura não está ativa, então o assistente está indisponível.'
        await mostrarEPersistir(texto)
        setCreditoEsgotado(err.codigo === 'sem_credito')
        return {}
      }
      const msg = err.message || 'Erro ao comunicar com a IA'
      setError(msg)
      return { error: msg }
    } finally {
      enviandoRef.current = false
      setLoading(false)
      // O custo real só é conhecido depois da resposta, então a barra é
      // atualizada aqui — inclusive quando a chamada falhou no meio.
      void buscarUsoCiclo().then((u) => {
        if (!u) return
        setUso(u)
        setCreditoEsgotado(u.restante <= 0)
      })
    }
  }

  const novaConversa = () => {
    const newId = crypto.randomUUID()
    localStorage.setItem('chat_sessao_id', newId)
    localStorage.setItem('chat_sessao_time', Date.now().toString())
    setSessaoId(newId)
    aplicar(() => [])
  }

  const mudarSessao = async (id: string) => {
    setSessaoId(id)
    aplicar(() => [])
    analisesRef.current = []
    await carregarHistorico(id)
  }

  const removerUltimaMensagem = useCallback(() => aplicar((prev) => prev.slice(0, -1)), [aplicar])

  /** Apaga uma mensagem do usuário e a resposta da IA que veio logo depois. */
  const excluirMensagem = useCallback(
    async (uid: string) => {
      let idBanco: string | undefined
      aplicar((prev) => {
        const idx = prev.findIndex((m) => m.uid === uid)
        if (idx === -1) return prev
        idBanco = prev[idx].id
        const fim = prev[idx + 1]?.role === 'assistant' ? idx + 2 : idx + 1
        return [...prev.slice(0, idx), ...prev.slice(fim)]
      })
      // Remove do banco a mensagem e a resposta seguinte da mesma sessão
      if (idBanco) {
        const { data: user } = await supabase.auth.getUser()
        if (user?.user) {
          const { data: linhas } = await supabase
            .from('mensagens_chat')
            .select('id, created_at')
            .eq('sessao_id', sessaoId)
            .order('created_at', { ascending: true })
          const i = (linhas || []).findIndex((l) => l.id === idBanco)
          if (i !== -1) {
            const alvos = [linhas![i].id]
            if (linhas![i + 1]) alvos.push(linhas![i + 1].id)
            await supabase.from('mensagens_chat').delete().in('id', alvos)
          }
        }
      }
    },
    [aplicar, sessaoId],
  )

  /**
   * Editar uma mensagem = REBOBINAR até ela. A IA esquece tudo daquele ponto em
   * diante: as mensagens seguintes (a memória "pura" da conversa) E as anotações
   * de longo prazo aprendidas dali para a frente. Deixa a mensagem editada como
   * a última e devolve true para o chamador reenviar o novo texto à IA.
   */
  const rebobinarPara = useCallback(
    async (uid: string, novoTexto: string, restauranteId: number | null): Promise<boolean> => {
      const idx = messagesRef.current.findIndex((m) => m.uid === uid)
      if (idx === -1) return false

      // Tela: mantém até a mensagem editada (com o novo texto) e descarta o resto
      aplicar((prev) =>
        prev.slice(0, idx + 1).map((m, i) => (i === idx ? { ...m, text: novoTexto } : m)),
      )

      // Banco: a ordem da conversa na tela espelha a do banco. Acha a linha da
      // mensagem editada por posição, apaga dela em diante e usa o created_at
      // como corte para esquecer as anotações aprendidas a partir daquele ponto.
      try {
        const { data: user } = await supabase.auth.getUser()
        if (user?.user) {
          const { data: linhas } = await supabase
            .from('mensagens_chat')
            .select('id, created_at')
            .eq('sessao_id', sessaoId)
            .order('created_at', { ascending: true })
          const alvo = linhas?.[idx]
          if (alvo) {
            const idsApagar = linhas!.slice(idx).map((l) => l.id)
            if (idsApagar.length) {
              await supabase.from('mensagens_chat').delete().in('id', idsApagar)
            }
            if (restauranteId && alvo.created_at) {
              await supabase
                .from('memoria_assistente')
                .delete()
                .eq('restaurante_id', restauranteId)
                .gte('created_at', alvo.created_at)
            }
          }
        }
      } catch {
        // Falha de limpeza não pode travar o reenvio — a conversa na tela já foi
        // rebobinada; o banco reconcilia no próximo carregamento.
      }
      return true
    },
    [aplicar, sessaoId],
  )

  /** Prende a proposta à última resposta da IA (o botão vive com a mensagem). */
  const anexarProposta = useCallback(
    (proposta: AcaoAgente | null): string | null => {
      let alvo: string | null = null
      aplicar((prev) => {
        const copia = [...prev]
        for (let i = copia.length - 1; i >= 0; i--) {
          if (copia[i].role === 'assistant') {
            alvo = copia[i].uid
            copia[i] = { ...copia[i], proposta }
            break
          }
        }
        return copia
      })
      return alvo
    },
    [aplicar],
  )

  /** Tira a proposta de uma mensagem (já aplicada ou descartada). */
  const limparProposta = useCallback(
    (uid: string) => aplicar((prev) => prev.map((m) => (m.uid === uid ? { ...m, proposta: null } : m))),
    [aplicar],
  )

  /** Marca a proposta como aceita (verde) SEM tirar o botão do chat. */
  const marcarPropostaAplicada = useCallback(
    (uid: string, registro: { id: string; descricao: string }) =>
      aplicar((prev) => prev.map((m) => (m.uid === uid ? { ...m, propostaRegistro: registro } : m))),
    [aplicar],
  )

  /** Desfazer: volta a proposta ao estado não-aceita (azul), mantendo o botão. */
  const desmarcarPropostaPorRegistro = useCallback(
    (registroId: string) =>
      aplicar((prev) =>
        prev.map((m) =>
          m.propostaRegistro?.id === registroId ? { ...m, propostaRegistro: null } : m,
        ),
      ),
    [aplicar],
  )

  /** Prende a marca de "feito" à última resposta da IA. */
  const anexarRegistro = useCallback(
    (registro: { id: string; descricao: string }) =>
      aplicar((prev) => {
        const copia = [...prev]
        for (let i = copia.length - 1; i >= 0; i--) {
          if (copia[i].role === 'assistant') {
            copia[i] = { ...copia[i], registros: [...(copia[i].registros || []), registro] }
            break
          }
        }
        return copia
      }),
    [aplicar],
  )

  /** Tira a marca da tela (a alteração continua valendo no sistema). */
  const removerRegistro = useCallback(
    (id: string) =>
      aplicar((prev) => prev.map((m) => (m.registros ? { ...m, registros: m.registros.filter((r) => r.id !== id) } : m))),
    [aplicar],
  )

  /**
   * Registra uma troca direta (usuário + IA) na tela e no banco, SEM passar pelo
   * redator. Usado ao responder um formulário: a ação já é montada pelos agentes,
   * então não faz sentido reprocessar tudo — isso evitava o texto de perguntas
   * cru virar mensagem e o erro que apagava a mensagem enviada.
   */
  const registrarTroca = useCallback(
    async (textoUsuario: string, textoAssistente: string): Promise<string> => {
      const assistUid = novoUid()
      aplicar((prev) => [
        ...prev,
        { uid: novoUid(), role: 'user', text: textoUsuario },
        { uid: assistUid, role: 'assistant', text: textoAssistente },
      ])
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('mensagens_chat').insert([
          { usuario_id: user.id, sessao_id: sessaoId, mensagem: textoUsuario, papel: 'usuario', contexto_pagina: contextoPagina, contexto_dados: {} },
          { usuario_id: user.id, sessao_id: sessaoId, mensagem: textoAssistente, papel: 'assistente', contexto_pagina: contextoPagina, contexto_dados: {} },
        ])
      }
      return assistUid
    },
    [aplicar, sessaoId, contextoPagina],
  )

  // Estado inicial do crédito, para a barra já aparecer certa ao abrir o chat.
  useEffect(() => {
    void buscarUsoCiclo().then((u) => {
      if (!u) return
      setUso(u)
      setCreditoEsgotado(u.restante <= 0)
    })
  }, [])

  return {
    messages,
    loading,
    buscandoWeb,
    error,
    uso,
    creditoEsgotado,
    enviar,
    adicionarMensagemUsuario,
    removerUltimaMensagem,
    excluirMensagem,
    rebobinarPara,
    anexarProposta,
    limparProposta,
    marcarPropostaAplicada,
    desmarcarPropostaPorRegistro,
    anexarRegistro,
    removerRegistro,
    registrarTroca,
    setLoading,
    carregarHistorico,
    setMessages: (m: MensagemChat[]) => aplicar(() => m),
    setError,
    sessaoId,
    novaConversa,
    mudarSessao,
  }
}
