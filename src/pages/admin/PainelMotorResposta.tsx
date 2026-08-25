import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Loader2, Send } from 'lucide-react'

/**
 * Parâmetros do motor de resposta, por restaurante.
 *
 * Fica no painel da plataforma, e não nas configurações do dono, porque estes
 * números protegem o número de WhatsApp do próprio restaurante: um dono ansioso
 * que zerasse o intervalo mínimo voltaria a mandar uma mensagem por transição —
 * o spam que derruba a instância e que este motor existe para evitar.
 *
 * O que o dono controla (validade do feedback) está em /configuracoes.
 */

/** Espelha os defaults da migration 20260825040000. */
const PADRAO = {
  ativo: false,
  cooldown_dias: 3,
  agregacao_min: 30,
  max_itens_msg: 4,
  quiet_inicio: 22,
  quiet_fim: 9,
  expira_aviso_dias: 14,
}

type ConfigMotor = typeof PADRAO

interface RestauranteLinha {
  id: number
  nome_restaurante: string | null
  config_insights: Record<string, unknown> | null
}

const HORAS = Array.from({ length: 24 }, (_, i) => i)

export function PainelMotorResposta() {
  const { toast } = useToast()
  const [restaurantes, setRestaurantes] = useState<RestauranteLinha[]>([])
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [config, setConfig] = useState<ConfigMotor>(PADRAO)
  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setCarregando(true)
    const { data, error } = await supabase
      .from('restaurantes')
      .select('id, nome_restaurante, config_insights')
      .is('excluida_em', null)
      .order('id')

    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' })
      setCarregando(false)
      return
    }

    const linhas = (data ?? []) as RestauranteLinha[]
    setRestaurantes(linhas)
    if (linhas.length > 0 && selecionado === null) setSelecionado(linhas[0].id)
    setCarregando(false)
  }, [toast, selecionado])

  useEffect(() => {
    carregar()
    // Só na montagem: recarregar a cada troca de restaurante descartaria
    // edições não salvas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Ao trocar de restaurante, lê a config dele (com os defaults por cima).
  useEffect(() => {
    const linha = restaurantes.find((r) => r.id === selecionado)
    if (!linha) return
    const bruto = (linha.config_insights?.motor_resposta ?? {}) as Partial<ConfigMotor>
    setConfig({
      ativo: bruto.ativo === true,
      cooldown_dias: Number(bruto.cooldown_dias ?? PADRAO.cooldown_dias),
      agregacao_min: Number(bruto.agregacao_min ?? PADRAO.agregacao_min),
      max_itens_msg: Number(bruto.max_itens_msg ?? PADRAO.max_itens_msg),
      quiet_inicio: Number(bruto.quiet_inicio ?? PADRAO.quiet_inicio),
      quiet_fim: Number(bruto.quiet_fim ?? PADRAO.quiet_fim),
      expira_aviso_dias: Number(bruto.expira_aviso_dias ?? PADRAO.expira_aviso_dias),
    })
  }, [selecionado, restaurantes])

  const salvar = async () => {
    if (!selecionado) return
    setSalvando(true)

    // Read-merge-write: `config_insights` guarda também a configuração de
    // análise (feedbacks_por_analise etc.) e a validade do feedback, editadas
    // em outras telas. Um update cru da coluna apagaria as duas.
    const { data: atual, error: erroLeitura } = await supabase
      .from('restaurantes')
      .select('config_insights')
      .eq('id', selecionado)
      .single()

    if (erroLeitura) {
      toast({ title: 'Erro ao salvar', description: erroLeitura.message, variant: 'destructive' })
      setSalvando(false)
      return
    }

    const base = (atual?.config_insights ?? {}) as Record<string, unknown>
    const merged = { ...base, motor_resposta: config }

    const { data, error } = await supabase
      .from('restaurantes')
      .update({ config_insights: merged })
      .eq('id', selecionado)
      .select('id')

    setSalvando(false)

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
      return
    }
    // A RLS devolve 200 sem alterar nada quando bloqueia; sem checar as linhas
    // mostraríamos um "salvo" falso (mesmo cuidado de Settings.tsx).
    if (!data || data.length === 0) {
      toast({
        title: 'Não foi salvo',
        description: 'Sem permissão para editar este restaurante.',
        variant: 'destructive',
      })
      return
    }

    setRestaurantes((prev) =>
      prev.map((r) => (r.id === selecionado ? { ...r, config_insights: merged } : r)),
    )
    toast({ title: 'Configuração salva' })
  }

  if (carregando) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Send className="w-4 h-4 text-[#1D4ED8]" />
            Motor de resposta
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Controla quando o cliente recebe retorno sobre os feedbacks que ele enviou. Uma pessoa
            nunca recebe mais de uma mensagem por intervalo, por restaurante — mesmo que várias
            ações dela avancem no mesmo dia.
          </p>
        </div>

        <div className="space-y-2 max-w-sm">
          <Label>Restaurante</Label>
          <Select
            value={selecionado ? String(selecionado) : ''}
            onValueChange={(v) => setSelecionado(Number(v))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Escolha um restaurante" />
            </SelectTrigger>
            <SelectContent>
              {restaurantes.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.nome_restaurante || `Restaurante ${r.id}`} (#{r.id})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border p-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Motor ativo</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Desligado, os avisos continuam sendo acumulados na fila, mas nada é enviado.
            </p>
          </div>
          <Switch
            checked={config.ativo}
            onCheckedChange={(v) => setConfig((c) => ({ ...c, ativo: v }))}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="cooldown">Intervalo mínimo entre mensagens (dias)</Label>
            <Input
              id="cooldown"
              type="number"
              min={1}
              max={30}
              value={config.cooldown_dias}
              onChange={(e) => setConfig((c) => ({ ...c, cooldown_dias: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">
              Padrão: 3 dias. É um só por pessoa — não um por etapa.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="agregacao">Janela de agrupamento (minutos)</Label>
            <Input
              id="agregacao"
              type="number"
              min={1}
              max={720}
              value={config.agregacao_min}
              onChange={(e) => setConfig((c) => ({ ...c, agregacao_min: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">
              Padrão: 30 min. Espera o dono terminar de mover os cards antes de enviar.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-itens">Máximo de assuntos por mensagem</Label>
            <Input
              id="max-itens"
              type="number"
              min={1}
              max={10}
              value={config.max_itens_msg}
              onChange={(e) => setConfig((c) => ({ ...c, max_itens_msg: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">
              Padrão: 4. O excedente vira "e mais N pontos".
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="expira">Validade do aviso (dias)</Label>
            <Input
              id="expira"
              type="number"
              min={1}
              max={90}
              value={config.expira_aviso_dias}
              onChange={(e) =>
                setConfig((c) => ({ ...c, expira_aviso_dias: Number(e.target.value) }))}
            />
            <p className="text-xs text-muted-foreground">
              Padrão: 14 dias. Aviso parado além disso não é mais enviado.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Horário de silêncio (Brasília)</Label>
          <div className="flex items-center gap-2">
            <Select
              value={String(config.quiet_inicio)}
              onValueChange={(v) => setConfig((c) => ({ ...c, quiet_inicio: Number(v) }))}
            >
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HORAS.map((h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}h</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">às</span>
            <Select
              value={String(config.quiet_fim)}
              onValueChange={(v) => setConfig((c) => ({ ...c, quiet_fim: Number(v) }))}
            >
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                {HORAS.map((h) => (
                  <SelectItem key={h} value={String(h)}>{String(h).padStart(2, '0')}h</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Padrão: 22h às 9h. Dentro da faixa o envio é adiado para o próximo horário útil — nunca
            cancelado.
          </p>
        </div>

        <div className="flex justify-end">
          <Button onClick={salvar} disabled={salvando || !selecionado}>
            {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
