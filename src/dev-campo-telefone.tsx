/**
 * Banco de teste do `CampoTelefone` e do fluxo de edição de garçom — página
 * isolada, sem login nem app, só pra dirigir a tela com teclado de verdade
 * num navegador de verdade (Playwright). Não entra em build de produção: as
 * entradas do build são só `index.html` e `f.html` (ver vite.config.ts).
 */
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { CampoTelefone } from '@/components/CampoTelefone'
import { telefoneNacionalValido } from '@/lib/telefone'

function CampoSozinho() {
  const [valor, setValor] = useState('')
  const [temDigitos, setTemDigitos] = useState(false)
  return (
    <section>
      <h2>Campo sozinho</h2>
      <CampoTelefone value={valor} onChange={(v, tem) => { setValor(v); setTemDigitos(tem) }} />
      <pre data-teste="valor">{valor}</pre>
      <pre data-teste="temDigitos">{String(temDigitos)}</pre>
      <button data-teste="carregar-do-banco" onClick={() => setValor('5511987654321')}>Carregar de fora</button>
      <button data-teste="limpar-de-fora" onClick={() => setValor('')}>Limpar de fora</button>
    </section>
  )
}

/**
 * Espelho do fluxo real de `Garcons.tsx`: abrir os detalhes de um garçom,
 * clicar em Editar (o que FECHA os detalhes — a origem do bug de salvar),
 * mexer no telefone e salvar.
 */
function FluxoEditarGarcom() {
  const [garcons, setGarcons] = useState([{ id: 2, nome: 'Rogério', telefone: '5511988887777' }])
  const [detalheId, setDetalheId] = useState<number | null>(null)
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [formAberto, setFormAberto] = useState<'criar' | 'editar' | null>(null)
  const [formTelefone, setFormTelefone] = useState('')
  const [gravado, setGravado] = useState('(nada gravado ainda)')

  const garcomAtual = garcons.find((g) => g.id === detalheId) ?? null

  const abrirEditar = (g: { id: number; telefone: string }) => {
    setDetalheId(null)
    setEditandoId(g.id)
    setFormAberto('editar')
    setFormTelefone(g.telefone ?? '')
  }

  const salvar = () => {
    if (!telefoneNacionalValido(formTelefone)) { setGravado('BLOQUEADO: telefone inválido'); return }
    if (formAberto === 'editar' && editandoId) {
      setGravado(`UPDATE garcons id=${editandoId} telefone=${formTelefone}`)
      setGarcons((p) => p.map((g) => (g.id === editandoId ? { ...g, telefone: formTelefone } : g)))
      setFormAberto(null)
      return
    }
    setGravado('ERRO: não identificou o garçom')
  }

  return (
    <section style={{ marginTop: 32 }}>
      <h2>Fluxo editar garçom</h2>
      <button data-teste="abrir-detalhe" onClick={() => setDetalheId(2)}>Abrir detalhes</button>
      {garcomAtual && (
        <button data-teste="abrir-editar" onClick={() => abrirEditar(garcomAtual)}>Editar</button>
      )}
      {formAberto && (
        <div>
          <CampoTelefone value={formTelefone} onChange={setFormTelefone} />
          <button data-teste="salvar" onClick={salvar}>Salvar</button>
        </div>
      )}
      <pre data-teste="gravado">{gravado}</pre>
      <pre data-teste="lista">{garcons.map((g) => `${g.id}:${g.telefone}`).join(',')}</pre>
    </section>
  )
}

createRoot(document.getElementById('root')!).render(
  <div style={{ padding: 24, fontFamily: 'system-ui' }}>
    <CampoSozinho />
    <FluxoEditarGarcom />
  </div>,
)
