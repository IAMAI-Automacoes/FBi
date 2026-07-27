// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      afiliados: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string | null
          chave_pix: string | null
          codigo: string
          codigo_banco: string | null
          comissao_tipo: string
          comissao_valor: number
          conta: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          stripe_account_id: string | null
          telefone: string | null
          tipo_conta: string | null
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          chave_pix?: string | null
          codigo: string
          codigo_banco?: string | null
          comissao_tipo?: string
          comissao_valor?: number
          conta?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          stripe_account_id?: string | null
          telefone?: string | null
          tipo_conta?: string | null
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string | null
          chave_pix?: string | null
          codigo?: string
          codigo_banco?: string | null
          comissao_tipo?: string
          comissao_valor?: number
          conta?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          stripe_account_id?: string | null
          telefone?: string | null
          tipo_conta?: string | null
        }
        Relationships: []
      }
      divisao_receita: {
        Row: {
          ativo: boolean | null
          chave_pix: string | null
          created_at: string | null
          id: string
          nome: string
          tipo: string
          valor: number
        }
        Insert: {
          ativo?: boolean | null
          chave_pix?: string | null
          created_at?: string | null
          id?: string
          nome: string
          tipo: string
          valor: number
        }
        Update: {
          ativo?: boolean | null
          chave_pix?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          tipo?: string
          valor?: number
        }
        Relationships: []
      }
      integracao_config: {
        Row: {
          chave: string
          updated_at: string
          valor: string
        }
        Insert: {
          chave: string
          updated_at?: string
          valor: string
        }
        Update: {
          chave?: string
          updated_at?: string
          valor?: string
        }
        Relationships: []
      }
      platform_admins: {
        Row: {
          email: string
        }
        Insert: {
          email: string
        }
        Update: {
          email?: string
        }
        Relationships: []
      }
      reacoes_sugestoes: {
        Row: {
          autor: string
          created_at: string
          emoji: string
          id: string
          mensagem_id: string
          sugestao_id: string
        }
        Insert: {
          autor: string
          created_at?: string
          emoji: string
          id?: string
          mensagem_id: string
          sugestao_id: string
        }
        Update: {
          autor?: string
          created_at?: string
          emoji?: string
          id?: string
          mensagem_id?: string
          sugestao_id?: string
        }
        Relationships: []
      }
      respostas_sugestoes: {
        Row: {
          arquivos: Json | null
          autor: string
          created_at: string
          id: string
          responde_a: string | null
          sugestao_id: string
          texto: string
        }
        Insert: {
          arquivos?: Json | null
          autor?: string
          created_at?: string
          id?: string
          responde_a?: string | null
          sugestao_id: string
          texto: string
        }
        Update: {
          arquivos?: Json | null
          autor?: string
          created_at?: string
          id?: string
          responde_a?: string | null
          sugestao_id?: string
          texto?: string
        }
        Relationships: []
      }
      sugestoes_plataforma: {
        Row: {
          admin_leu_em: string | null
          arquivos: Json
          cliente_leu_em: string | null
          created_at: string
          id: string
          restaurante_id: number | null
          status: string
          texto: string
          titulo: string | null
          usuario_id: string | null
        }
        Insert: {
          admin_leu_em?: string | null
          arquivos?: Json
          cliente_leu_em?: string | null
          created_at?: string
          id?: string
          restaurante_id?: number | null
          status?: string
          texto: string
          titulo?: string | null
          usuario_id?: string | null
        }
        Update: {
          admin_leu_em?: string | null
          arquivos?: Json
          cliente_leu_em?: string | null
          created_at?: string
          id?: string
          restaurante_id?: number | null
          status?: string
          texto?: string
          titulo?: string | null
          usuario_id?: string | null
        }
        Relationships: []
      }
      acoes_ia: {
        Row: {
          alvo_id: string | null
          alvo_tabela: string | null
          antes: Json | null
          created_at: string
          depois: Json | null
          descricao: string
          id: string
          modo: string
          restaurante_id: number
          revertido: boolean
          revertido_em: string | null
          tipo: string
        }
        Insert: {
          alvo_id?: string | null
          alvo_tabela?: string | null
          antes?: Json | null
          created_at?: string
          depois?: Json | null
          descricao: string
          id?: string
          modo?: string
          restaurante_id: number
          revertido?: boolean
          revertido_em?: string | null
          tipo: string
        }
        Update: {
          alvo_id?: string | null
          alvo_tabela?: string | null
          antes?: Json | null
          created_at?: string
          depois?: Json | null
          descricao?: string
          id?: string
          modo?: string
          restaurante_id?: number
          revertido?: boolean
          revertido_em?: string | null
          tipo?: string
        }
        Relationships: []
      }
      memoria_assistente: {
        Row: {
          categoria: string
          created_at: string
          fato: string
          id: string
          restaurante_id: number
        }
        Insert: {
          categoria?: string
          created_at?: string
          fato: string
          id?: string
          restaurante_id: number
        }
        Update: {
          categoria?: string
          created_at?: string
          fato?: string
          id?: string
          restaurante_id?: number
        }
        Relationships: []
      }
      documentos_ia: {
        Row: {
          created_at: string
          descricao: string | null
          erro: string | null
          escopo: string
          id: string
          origem: string
          restaurante_id: number | null
          status: string
          titulo: string
          total_trechos: number
          url: string | null
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          erro?: string | null
          escopo?: string
          id?: string
          origem?: string
          restaurante_id?: number | null
          status?: string
          titulo: string
          total_trechos?: number
          url?: string | null
        }
        Update: {
          created_at?: string
          descricao?: string | null
          erro?: string | null
          escopo?: string
          id?: string
          origem?: string
          restaurante_id?: number | null
          status?: string
          titulo?: string
          total_trechos?: number
          url?: string | null
        }
        Relationships: []
      }
      documento_trechos: {
        Row: {
          conteudo: string
          created_at: string
          documento_id: string
          embedding: string | null
          id: string
          posicao: number
          restaurante_id: number | null
        }
        Insert: {
          conteudo: string
          created_at?: string
          documento_id: string
          embedding?: string | null
          id?: string
          posicao?: number
          restaurante_id?: number | null
        }
        Update: {
          conteudo?: string
          created_at?: string
          documento_id?: string
          embedding?: string | null
          id?: string
          posicao?: number
          restaurante_id?: number | null
        }
        Relationships: []
      }
      acoes_operacionais: {
        Row: {
          categoria: string | null
          created_at: string
          feedback_id: number | null
          id: number
          ordem: number
          plano_detalhado: string | null
          prioridade: string | null
          restaurante_id: number | null
          status: string | null
          texto: string | null
          titulo_acao: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          feedback_id?: number | null
          id?: number
          ordem?: number
          plano_detalhado?: string | null
          prioridade?: string | null
          restaurante_id?: number | null
          status?: string | null
          texto?: string | null
          titulo_acao?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          feedback_id?: number | null
          id?: number
          ordem?: number
          plano_detalhado?: string | null
          prioridade?: string | null
          restaurante_id?: number | null
          status?: string | null
          texto?: string | null
          titulo_acao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acoes_operacionais_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          ativa: boolean | null
          created_at: string | null
          id: string
          nome: string
          restaurante_id: number | null
        }
        Insert: {
          ativa?: boolean | null
          created_at?: string | null
          id?: string
          nome: string
          restaurante_id?: number | null
        }
        Update: {
          ativa?: boolean | null
          created_at?: string | null
          id?: string
          nome?: string
          restaurante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "categorias_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      cupons: {
        Row: {
          ativo: boolean | null
          created_at: string
          cupom: string | null
          data_expiracao: string | null
          dias_validade: number | null
          id: number
          porcentagem_desconto: number | null
          valor_desconto: number | null
          vezes_usado: number
          vezes_uso_maximo: number
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string
          cupom?: string | null
          data_expiracao?: string | null
          dias_validade?: number | null
          id?: number
          porcentagem_desconto?: number | null
          valor_desconto?: number | null
          vezes_usado?: number
          vezes_uso_maximo?: number
        }
        Update: {
          ativo?: boolean | null
          created_at?: string
          cupom?: string | null
          data_expiracao?: string | null
          dias_validade?: number | null
          id?: number
          porcentagem_desconto?: number | null
          valor_desconto?: number | null
          vezes_usado?: number
          vezes_uso_maximo?: number
        }
        Relationships: []
      }
      feedbacks_restaurante: {
        Row: {
          categoria: string | null
          created_at: string
          garcom_id: string | null
          id: number
          restaurante_id: number | null
          resumo: string | null
          sentimento: string | null
          telefone_cliente: string | null
          texto_original: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          garcom_id?: string | null
          id?: number
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          texto_original?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          garcom_id?: string | null
          id?: number
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          texto_original?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_restaurante_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      garcons: {
        Row: {
          ativo: boolean | null
          created_at: string
          id: number
          nome_garcon: string | null
          restaurante_id: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string
          id?: number
          nome_garcon?: string | null
          restaurante_id?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string
          id?: number
          nome_garcon?: string | null
          restaurante_id?: number | null
        }
        Relationships: []
      }
      insights: {
        Row: {
          ativo: boolean | null
          categoria: string | null
          created_at: string | null
          descricao: string | null
          feedbacks_relacionados: number | null
          gerado_por: string | null
          id: string
          prioridade: string
          restaurante_id: number | null
          sugestao: string | null
          titulo: string
        }
        Insert: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          feedbacks_relacionados?: number | null
          gerado_por?: string | null
          id?: string
          prioridade: string
          restaurante_id?: number | null
          sugestao?: string | null
          titulo: string
        }
        Update: {
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          descricao?: string | null
          feedbacks_relacionados?: number | null
          gerado_por?: string | null
          id?: string
          prioridade?: string
          restaurante_id?: number | null
          sugestao?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_chat: {
        Row: {
          contexto_dados: Json | null
          contexto_pagina: string | null
          created_at: string | null
          id: string
          mensagem: string
          papel: string
          sessao_id: string
          usuario_id: string | null
        }
        Insert: {
          contexto_dados?: Json | null
          contexto_pagina?: string | null
          created_at?: string | null
          id?: string
          mensagem: string
          papel: string
          sessao_id: string
          usuario_id?: string | null
        }
        Update: {
          contexto_dados?: Json | null
          contexto_pagina?: string | null
          created_at?: string | null
          id?: string
          mensagem?: string
          papel?: string
          sessao_id?: string
          usuario_id?: string | null
        }
        Relationships: []
      }
      message_buffer: {
        Row: {
          created_at: string | null
          id: number
          message_content: string | null
          message_data: Json
          remote_id: string
        }
        Insert: {
          created_at?: string | null
          id?: number
          message_content?: string | null
          message_data: Json
          remote_id: string
        }
        Update: {
          created_at?: string | null
          id?: number
          message_content?: string | null
          message_data?: Json
          remote_id?: string
        }
        Relationships: []
      }
      notificacoes: {
        Row: {
          created_at: string | null
          id: string
          lida: boolean | null
          mensagem: string
          restaurante_id: number | null
          tipo: string | null
          titulo: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lida?: boolean | null
          mensagem: string
          restaurante_id?: number | null
          tipo?: string | null
          titulo: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lida?: boolean | null
          mensagem?: string
          restaurante_id?: number | null
          tipo?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "notificacoes_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      perguntas_direcionadas: {
        Row: {
          acao_id: number | null
          ativa: boolean | null
          created_at: string | null
          id: string
          pergunta: string
        }
        Insert: {
          acao_id?: number | null
          ativa?: boolean | null
          created_at?: string | null
          id?: string
          pergunta: string
        }
        Update: {
          acao_id?: number | null
          ativa?: boolean | null
          created_at?: string | null
          id?: string
          pergunta?: string
        }
        Relationships: [
          {
            foreignKeyName: "perguntas_direcionadas_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_codes: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          garcom_id: number | null
          id: number
          papel_fundo: string | null
          restaurante_id: number
          slug: string
          total_scans: number | null
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          garcom_id?: number | null
          id?: number
          papel_fundo?: string | null
          restaurante_id: number
          slug: string
          total_scans?: number | null
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          garcom_id?: number | null
          id?: number
          papel_fundo?: string | null
          restaurante_id?: number
          slug?: string
          total_scans?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_codes_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_scans: {
        Row: {
          id: string
          ip_hash: string | null
          qr_code_id: number
          scanned_at: string | null
          user_agent: string | null
        }
        Insert: {
          id?: string
          ip_hash?: string | null
          qr_code_id: number
          scanned_at?: string | null
          user_agent?: string | null
        }
        Update: {
          id?: string
          ip_hash?: string | null
          qr_code_id?: number
          scanned_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "qr_scans_qr_code_id_fkey"
            columns: ["qr_code_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      relatorios: {
        Row: {
          created_at: string | null
          dados_json: Json | null
          id: string
          periodo: string
          restaurante_id: number | null
          resumo_executivo: string | null
          url_pdf: string | null
        }
        Insert: {
          created_at?: string | null
          dados_json?: Json | null
          id?: string
          periodo: string
          restaurante_id?: number | null
          resumo_executivo?: string | null
          url_pdf?: string | null
        }
        Update: {
          created_at?: string | null
          dados_json?: Json | null
          id?: string
          periodo?: string
          restaurante_id?: number | null
          resumo_executivo?: string | null
          url_pdf?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "relatorios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurantes: {
        Row: {
          ativo: boolean | null
          auth_user_id: string | null
          avatar_url: string | null
          cargo: string
          config_insights: Json | null
          configuracoes: Json | null
          created_at: string
          detalhes: string | null
          perfil_notas: string | null
          ia_modo_acao: string
          perfil_restaurante: Json
          é_pagante: boolean | null
          email: string | null
          frequencia_relatorios: string | null
          funcoes_config: Json | null
          id: number
          logo_url: string | null
          mascote_config: Json | null
          metodo_coleta_feedback: string | null
          nome: string | null
          nome_restaurante: string | null
          qr_bg_imagem: string | null
          qr_bg_modo: string | null
          qr_estilo: string | null
          qr_filtro: string | null
          qr_mensagem: string | null
          numero_mesas: number | null
          numero_whatsapp: string | null
          onboarding_completo: boolean
          texto_banner: string | null
          tipo_culinaria: string | null
          ultima_analise_insights: string | null
          ultima_atualizacao_banner: string | null
          url_api: string | null
          username: string | null
          whatsapp_token: string | null
        }
        Insert: {
          ativo?: boolean | null
          auth_user_id?: string | null
          avatar_url?: string | null
          cargo?: string
          config_insights?: Json | null
          configuracoes?: Json | null
          created_at?: string
          detalhes?: string | null
          perfil_notas?: string | null
          ia_modo_acao?: string
          perfil_restaurante?: Json
          é_pagante?: boolean | null
          email?: string | null
          frequencia_relatorios?: string | null
          funcoes_config?: Json | null
          id?: number
          logo_url?: string | null
          mascote_config?: Json | null
          metodo_coleta_feedback?: string | null
          nome?: string | null
          nome_restaurante?: string | null
          qr_bg_imagem?: string | null
          qr_bg_modo?: string | null
          qr_estilo?: string | null
          qr_filtro?: string | null
          qr_mensagem?: string | null
          numero_mesas?: number | null
          numero_whatsapp?: string | null
          onboarding_completo?: boolean
          texto_banner?: string | null
          tipo_culinaria?: string | null
          ultima_analise_insights?: string | null
          ultima_atualizacao_banner?: string | null
          url_api?: string | null
          username?: string | null
          whatsapp_token?: string | null
        }
        Update: {
          ativo?: boolean | null
          auth_user_id?: string | null
          avatar_url?: string | null
          cargo?: string
          config_insights?: Json | null
          configuracoes?: Json | null
          created_at?: string
          detalhes?: string | null
          perfil_notas?: string | null
          ia_modo_acao?: string
          perfil_restaurante?: Json
          é_pagante?: boolean | null
          email?: string | null
          frequencia_relatorios?: string | null
          funcoes_config?: Json | null
          id?: number
          logo_url?: string | null
          mascote_config?: Json | null
          metodo_coleta_feedback?: string | null
          nome?: string | null
          nome_restaurante?: string | null
          qr_bg_imagem?: string | null
          qr_bg_modo?: string | null
          qr_estilo?: string | null
          qr_filtro?: string | null
          qr_mensagem?: string | null
          numero_mesas?: number | null
          numero_whatsapp?: string | null
          onboarding_completo?: boolean
          texto_banner?: string | null
          tipo_culinaria?: string | null
          ultima_analise_insights?: string | null
          ultima_atualizacao_banner?: string | null
          url_api?: string | null
          username?: string | null
          whatsapp_token?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      buscar_conhecimento: {
        Args: {
          consulta_embedding: string
          consulta_texto?: string
          limite?: number
          similaridade_minima?: number
        }
        Returns: {
          conteudo: string
          escopo: string
          similaridade: number
          titulo: string
          url: string
        }[]
      }
      buscar_conhecimento_para: {
        Args: {
          consulta_embedding: string
          consulta_texto?: string
          limite?: number
          p_restaurante_id: number
        }
        Returns: {
          conteudo: string
          escopo: string
          similaridade: number
          titulo: string
          url: string
        }[]
      }
      criar_restaurante_onboarding: {
        Args: { p_mascote_config: Json; p_nome_restaurante: string }
        Returns: number
      }
      get_user_restaurante_id: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
