import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'

interface PermissoesModulo {
  ver: boolean
  editar: boolean
}

interface Funcao {
  id: string
  nome: string
  permissoes: Record<string, PermissoesModulo>
}

interface UsePermissoesReturn {
  podeVer: (modulo: string) => boolean
  podeEditar: (modulo: string) => boolean
  funcao: Funcao | null
  carregando: boolean
}

export function usePermissoes(): UsePermissoesReturn {
  const { usuario, ehAdminPlataforma } = useAuth()
  const [funcao, setFuncao] = useState<Funcao | null>(null)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    const funcaoId = (usuario?.configuracoes as any)?.funcao_id

    // Admin e gerente sem funcao_id têm acesso total
    if (!funcaoId || !usuario?.restaurante_id) {
      setCarregando(false)
      return
    }

    const fetchFuncao = async () => {
      const { data } = await supabase
        .from('restaurantes')
        .select('funcoes_config')
        .eq('id', usuario.restaurante_id!)
        .single()

      if (data?.funcoes_config) {
        const lista = data.funcoes_config as unknown as Funcao[]
        const found = lista.find((f) => f.id === funcaoId) ?? null
        setFuncao(found)
      }
      setCarregando(false)
    }

    fetchFuncao()
  }, [usuario])

  // cargo admin ou sem funcao_id = acesso total
  const isAdmin = !usuario?.configuracoes || !(usuario.configuracoes as any).funcao_id

  // Admin da plataforma passa por cima das funções do restaurante — precisa
  // navegar por qualquer tela para dar suporte e reproduzir problema de cliente.
  // O bypass mora aqui, e não em `RotaPermitida`, para que todo consumidor de
  // `podeVer`/`podeEditar` herde a exceção em vez de cada um reimplementá-la.
  const acessoTotal = isAdmin || ehAdminPlataforma

  const podeVer = (modulo: string): boolean => {
    if (acessoTotal) return true
    return funcao?.permissoes?.[modulo]?.ver ?? false
  }

  const podeEditar = (modulo: string): boolean => {
    if (acessoTotal) return true
    return funcao?.permissoes?.[modulo]?.editar ?? false
  }

  return { podeVer, podeEditar, funcao, carregando }
}
