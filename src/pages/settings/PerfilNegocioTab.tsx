import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Building2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PontoPendente } from '@/components/PontoPendente'
import { camposFaltando, type CampoObrigatorio } from '@/lib/perfil-obrigatorio'

export interface PerfilNegocioForm {
  tipo_culinaria: string
  numero_mesas: string
  localizacao: string
  capacidade_lugares: string
  num_funcionarios: string
  faixa_preco: string
  horario_funcionamento: string
  publico_alvo: string
  detalhes: string
}

export const PERFIL_VAZIO: PerfilNegocioForm = {
  tipo_culinaria: '', numero_mesas: '', localizacao: '',
  capacidade_lugares: '', num_funcionarios: '', faixa_preco: '',
  horario_funcionamento: '', publico_alvo: '', detalhes: '',
}

export function PerfilNegocioTab({
  value,
  onChange,
}: {
  value: PerfilNegocioForm
  onChange: (v: PerfilNegocioForm) => void
}) {
  const set = (campo: keyof PerfilNegocioForm, v: string) => onChange({ ...value, [campo]: v })
  const faltando = camposFaltando(value)
  const vazio = (c: CampoObrigatorio) => faltando.includes(c)

  /** Rótulo com o asterisco de obrigatório. A bolinha fica só no título do card. */
  const rotulo = (id: CampoObrigatorio, texto: React.ReactNode, className?: string) => (
    <Label htmlFor={id} className={cn('flex items-center gap-1.5', className)}>
      {texto}
      <span aria-hidden className="text-red-500">*</span>
    </Label>
  )
  /** Campo vazio: borda e fundo amarelos, que somem ao digitar. */
  const realce = (id: CampoObrigatorio) =>
    vazio(id) && 'border-amber-400 bg-amber-50/70 focus-visible:ring-amber-400'

  const campo = (
    id: keyof PerfilNegocioForm,
    label: string,
    placeholder: string,
    tipo: string = 'text',
  ) => (
    <div className="space-y-2">
      {rotulo(id, label)}
      <Input
        id={id}
        type={tipo}
        required
        value={value[id] as string}
        onChange={(e) => set(id, e.target.value)}
        placeholder={placeholder}
        className={cn(realce(id))}
      />
    </div>
  )

  return (
    <Card
      className={cn(
        'shadow-subtle border-gray-200/75 rounded-xl overflow-hidden transition-shadow',
        faltando.length > 0 && 'border-amber-300 ring-2 ring-amber-300/70 ring-offset-2',
      )}
    >
      <CardHeader
        className={cn('pb-6 border-b', faltando.length > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-300')}
      >
        <CardTitle className="text-xl flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Sobre o restaurante
          {faltando.length > 0 && <PontoPendente titulo="Seção incompleta" className="ml-1" />}
        </CardTitle>
        <CardDescription className="text-sm mt-1">
          Os campos com <span className="text-red-500">*</span> são obrigatórios: é com eles que o
          assistente de IA entende o seu negócio e deixa as ações e as respostas aos clientes do
          jeito do seu restaurante.
        </CardDescription>
        {faltando.length > 0 && (
          <p className="text-sm font-medium text-amber-800 mt-2">
            {faltando.length === 1 ? 'Falta 1 campo' : `Faltam ${faltando.length} campos`} — estão
            marcados em amarelo abaixo.
          </p>
        )}
      </CardHeader>

      <CardContent className="space-y-8 p-6 sm:p-8 bg-white">
        <div className="grid gap-5 sm:grid-cols-2">
          {campo('tipo_culinaria', 'Tipo de cozinha', 'Ex: Italiana, Japonesa, Brasileira, Variada')}
          {campo('localizacao', 'Localização', 'Ex: Moema, São Paulo - SP')}
          {campo('numero_mesas', 'Número de mesas', 'Ex: 20', 'number')}
          {campo('capacidade_lugares', 'Capacidade (lugares)', 'Ex: 80', 'number')}
          {campo('num_funcionarios', 'Tamanho da equipe', 'Ex: 12', 'number')}
          {campo('faixa_preco', 'Ticket médio por pessoa', 'Ex: R$ 60 a R$ 90')}
          {campo('horario_funcionamento', 'Horário de funcionamento', 'Ex: Ter a dom, 11h às 23h')}
        </div>

        <div className="space-y-2">
          {rotulo('publico_alvo', 'Público que frequenta')}
          <Textarea
            id="publico_alvo" rows={3} required className={cn('resize-none', realce('publico_alvo'))}
            value={value.publico_alvo}
            onChange={(e) => set('publico_alvo', e.target.value)}
            placeholder="Ex: famílias no fim de semana, executivos no almoço durante a semana..."
          />
        </div>

        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-4">
          {rotulo('detalhes', (
            <>
              <Sparkles className="w-4 h-4 text-primary" />
              Conte tudo o que quiser sobre o restaurante
            </>
          ), 'gap-2')}
          <p className="text-xs text-muted-foreground">
            Escreva livremente: história, carro-chefe, o que te diferencia, o que te incomoda, como é
            a rotina, o que já tentou e não deu certo, planos para o futuro. Algumas linhas já
            ajudam — mas <b>quanto mais você contar, melhor a IA vai te ajudar</b>. Não existe
            resposta errada.
          </p>
          <Textarea
            id="detalhes" rows={8} required className={cn('resize-none', vazio('detalhes') ? realce('detalhes') : 'bg-white')}
            value={value.detalhes}
            onChange={(e) => set('detalhes', e.target.value)}
            placeholder="Ex: Abrimos em 2019 como uma cantina de bairro. Hoje o forte é o almoço executivo, mas queríamos crescer no jantar. A cozinha é enxuta, somos eu, minha esposa e três funcionários. O que mais me incomoda é a demora nos dias cheios..."
          />
        </div>
      </CardContent>
    </Card>
  )
}
