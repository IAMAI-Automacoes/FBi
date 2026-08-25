import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Camera, Mail, AtSign, UserIcon, Trash2, AlertTriangle, CreditCard } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/use-auth'
import { supabase } from '@/lib/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { getIniciais } from '@/lib/iniciais'
import { excluirMinhaConta } from '@/lib/queries/conta'
import { ImageCropper } from '@/components/ImageCropper'

export default function MyAccount() {
  const { usuario, refetchUsuario, logout } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [excluindo, setExcluindo] = useState(false)
  const [cancelando, setCancelando] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string>('')
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    nome: '',
    username: '',
    perfil_notas: '',
  })
  // Baseline do que está salvo, para habilitar "Salvar" só quando houver mudança
  const [salvo, setSalvo] = useState({ nome: '', username: '', perfil_notas: '' })

  useEffect(() => {
    if (!usuario) return
    // Começa com o nome do cache (login) só para não piscar vazio…
    const nomeCache = usuario.nome || ''
    setFormData({ nome: nomeCache, username: '', perfil_notas: '' })
    setSalvo({ nome: nomeCache, username: '', perfil_notas: '' })

    const fetchProfile = async () => {
      // …mas o valor de verdade vem do banco (fresco, sem cache), inclusive o
      // nome — assim, ao voltar para esta tela, o nome salvo aparece sem F5.
      const { data } = await supabase
        .from('usuarios')
        .select('nome, avatar_url, username, perfil_notas')
        .eq('id', usuario.id)
        .single()

      if (data) {
        if (data.avatar_url) setAvatarUrl(data.avatar_url)
        const nome = (data as any).nome ?? nomeCache
        const username = (data as any).username || ''
        const perfil_notas = (data as any).perfil_notas || ''
        setFormData({ nome, username, perfil_notas })
        setSalvo({ nome, username, perfil_notas })
      }
    }
    fetchProfile()
  }, [usuario])

  const alterado =
    formData.nome !== salvo.nome ||
    formData.username !== salvo.username ||
    formData.perfil_notas !== salvo.perfil_notas

  /** Só escolhe o arquivo — o upload de verdade só acontece depois do
   *  recorte, em `handleConfirmCrop`. */
  const handlePickFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) setCropFile(file)
  }

  const handleConfirmCrop = async (blob: Blob) => {
    if (!usuario?.id) return
    setCropFile(null)
    const filePath = `${usuario.id}-${Math.random()}.jpg`

    setUploadingAvatar(true)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, blob, { contentType: 'image/jpeg' })
    if (uploadError) {
      toast({ title: 'Erro', description: 'Falha no upload da imagem', variant: 'destructive' })
      setUploadingAvatar(false)
      return
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(filePath)

    const { error: updateError } = await supabase
      .from('usuarios')
      .update({ avatar_url: publicUrl })
      .eq('id', usuario.id)

    if (updateError) {
      toast({
        title: 'Erro',
        description: 'Falha ao salvar a imagem no perfil',
        variant: 'destructive',
      })
    } else {
      setAvatarUrl(publicUrl)
      refetchUsuario() // atualiza a foto no cabeçalho/sidebar sem F5
      toast({ title: 'Sucesso', description: 'Foto de perfil atualizada.' })
    }
    setUploadingAvatar(false)
  }

  const handleRemoveAvatar = async () => {
    if (!usuario?.id) return
    setUploadingAvatar(true)
    await supabase.from('usuarios').update({ avatar_url: null }).eq('id', usuario.id)
    setAvatarUrl('')
    refetchUsuario()
    setUploadingAvatar(false)
    toast({ title: 'Removida', description: 'Foto de perfil removida.' })
  }

  const handleSave = async () => {
    if (!usuario?.id) return
    setLoading(true)

    const finalUsername = formData.username.trim() === '' ? null : formData.username.trim()

    if (finalUsername) {
      const { data: existingUser } = await supabase
        .from('usuarios')
        .select('id')
        .eq('username', finalUsername)
        .neq('id', usuario.id)
        .maybeSingle()

      if (existingUser) {
        toast({
          title: 'Username indisponível',
          description: 'Este username já está sendo usado por outra pessoa.',
          variant: 'destructive',
        })
        setLoading(false)
        return
      }
    }

    // .select('id'): detecta bloqueio de RLS (0 linhas), que vinha como 200 sem
    // erro — antes mostrava "salvo" falso e o perfil não mudava de verdade.
    const { data, error } = await supabase
      .from('usuarios')
      .update({
        nome: formData.nome,
        username: finalUsername,
        perfil_notas: formData.perfil_notas || null,
      } as any)
      .eq('id', usuario.id)
      .select('id')

    setLoading(false)

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' })
      return
    }
    if (!data || data.length === 0) {
      toast({
        title: 'Não foi salvo',
        description: 'Sem permissão ou sessão expirada. Recarregue a página e entre de novo.',
        variant: 'destructive',
      })
      return
    }
    setSalvo({ nome: formData.nome, username: finalUsername || '', perfil_notas: formData.perfil_notas })
    // Atualiza o useAuth (nome/dados usados no cabeçalho e em outras telas), sem F5
    refetchUsuario()
    toast({ title: 'Salvo', description: 'Perfil atualizado.' })
  }

  const handleExcluirConta = async () => {
    if (!confirm(
      'Tem certeza que quer EXCLUIR sua conta?\n\n' +
      'Você perde o acesso na hora e não recupera sozinho, nem criando conta de novo com o ' +
      'mesmo email. Fale com o suporte se precisar restaurar depois.',
    )) return
    setExcluindo(true)
    try {
      await excluirMinhaConta()
      await logout()
      window.location.href = '/login'
    } catch (e: any) {
      toast({ title: 'Não foi possível excluir', description: e.message, variant: 'destructive' })
      setExcluindo(false)
    }
  }

  const handleCancelarAssinatura = async () => {
    if (
      !confirm(
        'Cancelar sua assinatura?\n\n' +
          'Você mantém o acesso até a data que já pagou (se houver) e, depois disso, o painel é ' +
          'bloqueado. Seus dados continuam guardados — é só reativar quando quiser.',
      )
    )
      return
    setCancelando(true)
    try {
      const { data, error } = await supabase.functions.invoke('cancelar-assinatura', { body: {} })
      if (error) {
        let msg = error.message
        try {
          const corpo = await (error as any).context?.json?.()
          if (corpo?.error) msg = corpo.error
        } catch {
          /* usa a mensagem padrão */
        }
        throw new Error(msg)
      }
      if ((data as any)?.error) throw new Error((data as any).error)

      const modo = (data as any)?.modo
      const ate = (data as any)?.acesso_ate
      toast({
        title: 'Assinatura cancelada',
        description:
          modo === 'agendado' && ate
            ? `Você mantém o acesso até ${new Date(ate).toLocaleDateString('pt-BR')}.`
            : 'Seu acesso foi encerrado. Seus dados continuam guardados.',
      })
      await refetchUsuario()
      if (modo === 'encerrada') window.location.href = '/assinatura'
    } catch (e: any) {
      toast({ title: 'Não foi possível cancelar', description: e.message, variant: 'destructive' })
    } finally {
      setCancelando(false)
    }
  }

  if (!usuario) {
    return (
      <div className="min-h-screen bg-gray-50/50 p-8">
        <Skeleton className="h-8 w-64 mb-8" />
        <Skeleton className="h-96 w-full max-w-2xl mx-auto rounded-xl" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F9FAFB] flex flex-col">
      <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b bg-white px-6 shadow-sm">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground hover:bg-secondary p-2 rounded-md transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-lg font-semibold text-foreground">Perfil Pessoal</h1>
      </header>

      <main className="flex-1 p-6 md:p-10 overflow-auto">
        <div className="max-w-3xl mx-auto space-y-8 animate-fade-in-up">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-gray-900">
              Configurações de Perfil
            </h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Gerencie suas informações pessoais e credenciais de acesso.
            </p>
          </div>

          <div className="bg-white rounded-xl border border-gray-200/75 shadow-subtle overflow-hidden">
            <div className="p-6 sm:p-10 space-y-10">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-8">
                <div
                  className="relative group cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Avatar className="h-28 w-28 border border-gray-200 shadow-sm transition-transform group-hover:scale-[1.02]">
                    {avatarUrl && <AvatarImage src={avatarUrl} alt={usuario.nome || 'Usuário'} />}
                    <AvatarFallback className="text-3xl bg-primary/10 text-primary font-semibold">
                      {getIniciais(usuario.nome, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="absolute -bottom-2 -right-2 p-2 bg-white text-gray-600 rounded-full shadow-md border border-gray-300 hover:text-primary hover:border-primary/30 transition-colors">
                    <Camera className="h-4 w-4" />
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg, image/gif"
                    onChange={handlePickFile}
                    disabled={uploadingAvatar}
                  />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-medium text-gray-900 text-base">Foto de Perfil</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Você ajusta o recorte e o zoom antes de enviar. Formatos suportados: JPG, PNG
                    ou GIF.
                  </p>
                  <div className="flex gap-3 pt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingAvatar}
                    >
                      {uploadingAvatar ? 'Enviando...' : 'Fazer upload'}
                    </Button>
                    {avatarUrl && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={handleRemoveAvatar}
                        disabled={uploadingAvatar}
                      >
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-8 border-t border-gray-300 pt-8">
                <div className="grid sm:grid-cols-2 gap-6">
                  <div className="space-y-2.5">
                    <Label htmlFor="nome" className="text-sm font-medium flex items-center gap-2">
                      <UserIcon className="h-4 w-4 text-gray-400" />
                      Como prefere ser chamado
                    </Label>
                    <Input
                      id="nome"
                      value={formData.nome}
                      onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                      placeholder="Seu nome ou apelido"
                    />
                  </div>

                  <div className="space-y-2.5">
                    <Label
                      htmlFor="username"
                      className="text-sm font-medium flex items-center gap-2"
                    >
                      <AtSign className="h-4 w-4 text-gray-400" />
                      Username
                    </Label>
                    <Input
                      id="username"
                      value={formData.username}
                      onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                      placeholder="seu_username"
                    />
                  </div>
                </div>

                <div className="space-y-2.5">
                  <Label
                    htmlFor="email"
                    className="text-sm font-medium flex items-center gap-2 text-gray-700"
                  >
                    <Mail className="h-4 w-4 text-gray-400" />
                    Endereço de E-mail
                  </Label>
                  <Input
                    id="email"
                    value={usuario.email || ''}
                    readOnly
                    className="max-w-md bg-gray-50/50 text-gray-500 cursor-not-allowed shadow-none"
                  />
                  <p className="text-[13px] text-muted-foreground mt-1">
                    O e-mail é utilizado para login e notificações de segurança.
                  </p>
                </div>

                <div className="space-y-2.5">
                  <Label htmlFor="perfil_notas" className="text-sm font-medium flex items-center gap-2">
                    <UserIcon className="h-4 w-4 text-gray-400" />
                    Sobre você
                  </Label>
                  <Textarea
                    id="perfil_notas"
                    rows={5}
                    className="resize-none"
                    value={formData.perfil_notas}
                    onChange={(e) => setFormData({ ...formData, perfil_notas: e.target.value })}
                    placeholder="Escreva o que quiser sobre você: sua rotina, o que te motivou a abrir o restaurante, suas preferências… A IA também anota aqui o que você conta sobre você durante as conversas."
                  />
                  <p className="text-[13px] text-muted-foreground mt-1">
                    Campo livre. Ajuda a IA a te conhecer e responder de forma mais pessoal.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50/80 px-6 sm:px-10 py-5 border-t border-gray-300 flex justify-end">
              <Button onClick={handleSave} disabled={!alterado || loading} className="min-w-[140px]">
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </div>

          {/* Assinatura */}
          <div className="rounded-2xl border border-gray-200/75 bg-white p-5 sm:p-6 shadow-subtle">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <CreditCard className="h-5 w-5 text-gray-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-gray-900">Assinatura</h3>
                <p className="text-[13px] text-gray-600 mt-1">
                  {usuario.assinatura_cancelada_em && usuario.assinatura_status === 'ativa' ? (
                    <>
                      Cancelada — seu acesso continua até{' '}
                      <span className="font-medium text-gray-800">
                        {usuario.assinatura_expira_em
                          ? new Date(usuario.assinatura_expira_em).toLocaleDateString('pt-BR')
                          : 'o fim do período'}
                      </span>
                      . Depois o painel é bloqueado; seus dados ficam guardados.
                    </>
                  ) : usuario.assinatura_status === 'ativa' ? (
                    <>
                      Ativa
                      {usuario.assinatura_expira_em
                        ? ` · válida até ${new Date(usuario.assinatura_expira_em).toLocaleDateString('pt-BR')}`
                        : ' · sem data de expiração'}
                      .
                    </>
                  ) : usuario.assinatura_status === 'cancelada' ? (
                    <>Cancelada. Reative quando quiser para voltar a usar o painel.</>
                  ) : usuario.assinatura_status === 'inadimplente' ? (
                    <>Pagamento pendente.</>
                  ) : (
                    <>Sem assinatura ativa.</>
                  )}
                </p>
                {usuario.assinatura_status !== 'ativa' &&
                  usuario.assinatura_status !== 'inadimplente' && (
                    <Link
                      to="/assinatura"
                      className="text-[13px] font-medium text-[#1D4ED8] hover:underline mt-1 inline-block"
                    >
                      Ver planos
                    </Link>
                  )}
              </div>
              {(usuario.assinatura_status === 'ativa' ||
                usuario.assinatura_status === 'inadimplente') &&
                !usuario.assinatura_cancelada_em && (
                  <Button
                    variant="outline"
                    onClick={handleCancelarAssinatura}
                    disabled={cancelando}
                    className="shrink-0 text-red-600 border-red-200 hover:bg-red-50"
                  >
                    {cancelando ? 'Cancelando…' : 'Cancelar assinatura'}
                  </Button>
                )}
            </div>
          </div>

          {/* Zona de perigo — excluir a própria conta (reversível só pelo suporte) */}
          <div className="mt-6 rounded-2xl border border-red-200 bg-red-50/40 p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-red-800">Excluir minha conta</h3>
                <p className="text-[13px] text-red-700/80 mt-1">
                  Você perde o acesso na hora e não recupera sozinho, nem criando conta de novo com o
                  mesmo email. Os dados ficam guardados e só o suporte restaura, se você pedir.
                </p>
              </div>
              <Button
                variant="destructive"
                onClick={handleExcluirConta}
                disabled={excluindo}
                className="shrink-0 gap-1.5"
              >
                <Trash2 className="h-4 w-4" />
                {excluindo ? 'Excluindo...' : 'Excluir conta'}
              </Button>
            </div>
          </div>
        </div>
      </main>

      {cropFile && (
        <ImageCropper
          file={cropFile}
          salvando={uploadingAvatar}
          onConfirm={handleConfirmCrop}
          onCancel={() => setCropFile(null)}
          outputWidth={800}
          outputHeight={800}
          shape="circle"
          title="Ajuste a foto de perfil"
          instructions="Arraste para posicionar e dê zoom com a roda do mouse (ou o controle abaixo). O que ficar dentro do círculo é a foto mostrada."
        />
      )}
    </div>
  )
}
