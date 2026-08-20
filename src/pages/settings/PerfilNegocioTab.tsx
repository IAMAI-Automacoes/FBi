import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Building2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface PerfilNegocioForm {
  tipo_culinaria: string
  numero_mesas: string
  estilo: string
  localizacao: string
  capacidade_lugares: string
  num_funcionarios: string
  faixa_preco: string
  horario_funcionamento: string
  publico_alvo: string
  pratos_destaque: string
  servicos: string[]
  diferenciais: string
  desafios: string
  ano_abertura: string
  detalhes: string
}

export const PERFIL_VAZIO: PerfilNegocioForm = {
  tipo_culinaria: '', numero_mesas: '', estilo: '', localizacao: '',
  capacidade_lugares: '', num_funcionarios: '', faixa_preco: '',
  horario_funcionamento: '', publico_alvo: '', pratos_destaque: '',
  servicos: [], diferenciais: '', desafios: '', ano_abertura: '', detalhes: '',
}

const SERVICOS = [
  'Delivery', 'Retirada no balcão', 'Reservas', 'Estacionamento', 'Wi-Fi',
  'Música ao vivo', 'Área externa', 'Pet friendly', 'Acessibilidade',
  'Espaço kids', 'Aceita vale-refeição', 'Salão para eventos',
]

const ESTILOS = [
  'Casual', 'Boteco / Bar', 'Fast food', 'Self-service / Buffet', 'À la carte',
  'Fine dining', 'Cafeteria', 'Pizzaria', 'Hamburgueria', 'Marmitaria',
]

export function PerfilNegocioTab({
  value,
  onChange,
}: {
  value: PerfilNegocioForm
  onChange: (v: PerfilNegocioForm) => void
}) {
  const set = (campo: keyof PerfilNegocioForm, v: any) => onChange({ ...value, [campo]: v })

  const toggleServico = (s: string) =>
    set('servicos', value.servicos.includes(s)
      ? value.servicos.filter((x) => x !== s)
      : [...value.servicos, s])

  const campo = (
    id: keyof PerfilNegocioForm,
    label: string,
    placeholder: string,
    tipo: string = 'text',
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={tipo}
        value={value[id] as string}
        onChange={(e) => set(id, e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )

  return (
    <Card className="shadow-subtle border-gray-200/75 rounded-xl overflow-hidden">
      <CardHeader className="bg-white pb-6 border-b border-gray-300">
        <CardTitle className="text-xl flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" />
          Sobre o restaurante
        </CardTitle>
        <CardDescription className="text-sm mt-1">
          Quanto mais você preencher, melhor o assistente de IA entende o seu negócio e mais
          específicas ficam as respostas, os insights e os relatórios.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-8 p-6 sm:p-8 bg-white">
        <div className="grid gap-5 sm:grid-cols-2">
          {campo('tipo_culinaria', 'Tipo de cozinha', 'Ex: Italiana, Japonesa, Brasileira, Variada')}
          {campo('localizacao', 'Localização', 'Ex: Moema, São Paulo - SP')}
          {campo('numero_mesas', 'Número de mesas', 'Ex: 20', 'number')}
          {campo('capacidade_lugares', 'Capacidade (lugares)', 'Ex: 80', 'number')}
          {campo('num_funcionarios', 'Tamanho da equipe', 'Ex: 12', 'number')}
          {campo('ano_abertura', 'Aberto desde (ano)', 'Ex: 2019', 'number')}
          {campo('faixa_preco', 'Ticket médio por pessoa', 'Ex: R$ 60 a R$ 90')}
          {campo('horario_funcionamento', 'Horário de funcionamento', 'Ex: Ter a dom, 11h às 23h')}
        </div>

        <div className="space-y-2">
          <Label>Estilo do restaurante</Label>
          <div className="flex flex-wrap gap-2">
            {ESTILOS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => set('estilo', value.estilo === e ? '' : e)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  value.estilo === e
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-muted-foreground border-gray-200 hover:border-primary/40 hover:text-foreground',
                )}
              >
                {e}
              </button>
            ))}
          </div>
          <Input
            value={value.estilo}
            onChange={(e) => set('estilo', e.target.value)}
            placeholder="Ou escreva o estilo do seu jeito"
            className="mt-2 max-w-sm"
          />
        </div>

        <div className="space-y-2">
          <Label>O que o restaurante oferece</Label>
          <div className="flex flex-wrap gap-2">
            {SERVICOS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => toggleServico(s)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                  value.servicos.includes(s)
                    ? 'bg-primary/10 text-primary border-primary/40'
                    : 'bg-white text-muted-foreground border-gray-200 hover:border-primary/40 hover:text-foreground',
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="publico_alvo">Público que frequenta</Label>
            <Textarea
              id="publico_alvo" rows={3} className="resize-none"
              value={value.publico_alvo}
              onChange={(e) => set('publico_alvo', e.target.value)}
              placeholder="Ex: famílias no fim de semana, executivos no almoço durante a semana..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pratos_destaque">Pratos e bebidas que mais saem</Label>
            <Textarea
              id="pratos_destaque" rows={3} className="resize-none"
              value={value.pratos_destaque}
              onChange={(e) => set('pratos_destaque', e.target.value)}
              placeholder="Ex: parmegiana da casa, chopp artesanal, feijoada de sábado..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="diferenciais">Seus diferenciais</Label>
            <Textarea
              id="diferenciais" rows={3} className="resize-none"
              value={value.diferenciais}
              onChange={(e) => set('diferenciais', e.target.value)}
              placeholder="Ex: massa fresca feita na casa, forno a lenha, atendimento que conhece o cliente pelo nome..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desafios">Seus maiores desafios hoje</Label>
            <Textarea
              id="desafios" rows={3} className="resize-none"
              value={value.desafios}
              onChange={(e) => set('desafios', e.target.value)}
              placeholder="Ex: fila no sábado, rotatividade da equipe, custo da carne subindo..."
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/[0.03] p-4">
          <Label htmlFor="detalhes" className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            Conte tudo o que quiser sobre o restaurante
          </Label>
          <p className="text-xs text-muted-foreground">
            Escreva livremente: história, o que te orgulha, o que te incomoda, como é a rotina, quem é
            a equipe, o que já tentou e não deu certo, planos para o futuro. Nada aqui é obrigatório —
            mas <b>quanto mais você contar, melhor a IA vai te ajudar</b>. Não existe resposta errada.
          </p>
          <Textarea
            id="detalhes" rows={8} className="resize-none bg-white"
            value={value.detalhes}
            onChange={(e) => set('detalhes', e.target.value)}
            placeholder="Ex: Abrimos em 2019 como uma cantina de bairro. Hoje o forte é o almoço executivo, mas queríamos crescer no jantar. A cozinha é enxuta, somos eu, minha esposa e três funcionários. O que mais me incomoda é a demora nos dias cheios..."
          />
        </div>
      </CardContent>
    </Card>
  )
}
