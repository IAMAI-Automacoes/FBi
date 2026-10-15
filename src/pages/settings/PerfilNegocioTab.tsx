import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card'
import { Building2, Sparkles } from 'lucide-react'

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
          {campo('faixa_preco', 'Ticket médio por pessoa', 'Ex: R$ 60 a R$ 90')}
          {campo('horario_funcionamento', 'Horário de funcionamento', 'Ex: Ter a dom, 11h às 23h')}
        </div>

        <div className="space-y-2">
          <Label htmlFor="publico_alvo">Público que frequenta</Label>
          <Textarea
            id="publico_alvo" rows={3} className="resize-none"
            value={value.publico_alvo}
            onChange={(e) => set('publico_alvo', e.target.value)}
            placeholder="Ex: famílias no fim de semana, executivos no almoço durante a semana..."
          />
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
