import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, Camera, Mail, AtSign, UserIcon } from 'lucide-react'
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

export default function MyAccount() {
  const { usuario } = useAuth()
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string>('')
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
    const nome = usuario.nome || ''
    setFormData({ nome, username: '', perfil_notas: '' })
    setSalvo({ nome, username: '', perfil_notas: '' })

    const fetchProfile = async () => {
      const { data } = await supabase
        .from('restaurantes')
        .select('avatar_url, username, perfil_notas')
        .eq('auth_user_id', usuario.id)
        .single()

      if (data) {
        if (data.avatar_url) setAvatarUrl(data.avatar_url)
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

  const handleUploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!event.target.files || event.target.files.length === 0 || !usuario?.id) return
    const file = event.target.files[0]
    const fileExt = file.name.split('.').pop()
    const filePath = `${usuario.id}-${Math.random()}.${fileExt}`

    setUploadingAvatar(true)
    const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file)
    if (uploadError) {
      toast({ title: 'Erro', description: 'Falha no upload da imagem', variant: 'destructive' })
      setUploadingAvatar(false)
      return
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from('avatars').getPublicUrl(filePath)

    const { error: updateError } = await supabase
      .from('restaurantes')
      .update({ avatar_url: publicUrl })
      .eq('auth_user_id', usuario.id)

    if (updateError) {
      toast({
        title: 'Erro',
        description: 'Falha ao salvar a imagem no perfil',
        variant: 'destructive',
      })
      setUploadingAvatar(false)
    } else {
      setAvatarUrl(publicUrl)
      toast({ title: 'Sucesso', description: 'Foto atualizada. Atualizando…' })
      // F5 automático: garante que a foto reflita na sidebar/header sem cache
      setTimeout(() => window.location.reload(), 600)
    }
  }

  const handleRemoveAvatar = async () => {
    if (!usuario?.id) return
    setUploadingAvatar(true)
    await supabase.from('restaurantes').update({ avatar_url: null }).eq('auth_user_id', usuario.id)
    setAvatarUrl('')
    toast({ title: 'Removida', description: 'Atualizando…' })
    setTimeout(() => window.location.reload(), 600)
  }

  const handleSave = async () => {
    if (!usuario?.id) return
    setLoading(true)

    const finalUsername = formData.username.trim() === '' ? null : formData.username.trim()

    if (finalUsername) {
      const { data: existingUser } = await supabase
        .from('restaurantes')
        .select('id')
        .eq('username', finalUsername)
        .neq('auth_user_id', usuario.id)
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

    const { error } = await supabase
      .from('restaurantes')
      .update({
        nome: formData.nome,
        username: finalUsername,
        perfil_notas: formData.perfil_notas || null,
      } as any)
      .eq('auth_user_id', usuario.id)

    setLoading(false)

    if (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as alterações.',
        variant: 'destructive',
      })
    } else {
      setSalvo({ nome: formData.nome, username: finalUsername || '', perfil_notas: formData.perfil_notas })
      toast({ title: 'Sucesso', description: 'Atualizando a página…' })
      // F5 automático (igual às Configurações): reflete tudo sem depender de cache
      setTimeout(() => window.location.reload(), 600)
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
                  <div className="absolute -bottom-2 -right-2 p-2 bg-white text-gray-600 rounded-full shadow-md border border-gray-100 hover:text-primary hover:border-primary/30 transition-colors">
                    <Camera className="h-4 w-4" />
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/png, image/jpeg, image/gif"
                    onChange={handleUploadAvatar}
                    disabled={uploadingAvatar}
                  />
                </div>
                <div className="space-y-1.5">
                  <h3 className="font-medium text-gray-900 text-base">Foto de Perfil</h3>
                  <p className="text-sm text-muted-foreground max-w-sm">
                    Recomendamos uma imagem quadrada. Formatos suportados: JPG, PNG ou GIF (Máx.
                    2MB).
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

              <div className="grid grid-cols-1 gap-8 border-t border-gray-100 pt-8">
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

            <div className="bg-gray-50/80 px-6 sm:px-10 py-5 border-t border-gray-100 flex justify-end">
              <Button onClick={handleSave} disabled={!alterado || loading} className="min-w-[140px]">
                {loading ? 'Salvando...' : 'Salvar Alterações'}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
