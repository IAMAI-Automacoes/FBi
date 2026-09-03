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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      acao_status_historico: {
        Row: {
          acao_id: number
          cancelado_em: string | null
          criado_em: string
          id: number
          promover_em: string | null
          promovido_em: string | null
          restaurante_id: number | null
          status_de: string | null
          status_para: string
        }
        Insert: {
          acao_id: number
          cancelado_em?: string | null
          criado_em?: string
          id?: never
          promover_em?: string | null
          promovido_em?: string | null
          restaurante_id?: number | null
          status_de?: string | null
          status_para: string
        }
        Update: {
          acao_id?: number
          cancelado_em?: string | null
          criado_em?: string
          id?: never
          promover_em?: string | null
          promovido_em?: string | null
          restaurante_id?: number | null
          status_de?: string | null
          status_para?: string
        }
        Relationships: [
          {
            foreignKeyName: "acao_status_historico_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
        ]
      }
      acoes_operacionais: {
        Row: {
          arquivada_em: string | null
          categoria: string | null
          concluida_em: string | null
          created_at: string
          feedback_id: number | null
          fixado: boolean
          id: number
          insight_id: string | null
          ordem: number
          originais_ids: string[]
          plano_detalhado: string | null
          pontos_ids: number[]
          prazo: string | null
          prioridade: string | null
          responsavel: string | null
          restaurante_id: number | null
          status: string | null
          texto: string | null
          titulo_acao: string | null
        }
        Insert: {
          arquivada_em?: string | null
          categoria?: string | null
          concluida_em?: string | null
          created_at?: string
          feedback_id?: number | null
          fixado?: boolean
          id?: number
          insight_id?: string | null
          ordem?: number
          originais_ids?: string[]
          plano_detalhado?: string | null
          pontos_ids?: number[]
          prazo?: string | null
          prioridade?: string | null
          responsavel?: string | null
          restaurante_id?: number | null
          status?: string | null
          texto?: string | null
          titulo_acao?: string | null
        }
        Update: {
          arquivada_em?: string | null
          categoria?: string | null
          concluida_em?: string | null
          created_at?: string
          feedback_id?: number | null
          fixado?: boolean
          id?: number
          insight_id?: string | null
          ordem?: number
          originais_ids?: string[]
          plano_detalhado?: string | null
          pontos_ids?: number[]
          prazo?: string | null
          prioridade?: string | null
          responsavel?: string | null
          restaurante_id?: number | null
          status?: string | null
          texto?: string | null
          titulo_acao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "acoes_operacionais_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acoes_operacionais_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
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
      agentes_ia: {
        Row: {
          ativo: boolean
          avancado: Json
          id: string
          max_tokens: number | null
          modelo: string | null
          temperature: number | null
          top_p: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          ativo?: boolean
          avancado?: Json
          id: string
          max_tokens?: number | null
          modelo?: string | null
          temperature?: number | null
          top_p?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          ativo?: boolean
          avancado?: Json
          id?: string
          max_tokens?: number | null
          modelo?: string | null
          temperature?: number | null
          top_p?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      aviso_pendente: {
        Row: {
          acao_id: number
          contato_id: string
          criado_em: string
          etapa: Database["public"]["Enums"]["aviso_etapa"]
          expira_em: string
          feedback_restaurante_id: number | null
          feedbacks_originais_ids: string[]
          feedbacks_restaurante_ids: number[]
          id: string
          mensagem_id: string | null
          restaurante_id: number
          status: Database["public"]["Enums"]["aviso_status"]
        }
        Insert: {
          acao_id: number
          contato_id: string
          criado_em?: string
          etapa: Database["public"]["Enums"]["aviso_etapa"]
          expira_em: string
          feedback_restaurante_id?: number | null
          feedbacks_originais_ids?: string[]
          feedbacks_restaurante_ids?: number[]
          id?: string
          mensagem_id?: string | null
          restaurante_id: number
          status?: Database["public"]["Enums"]["aviso_status"]
        }
        Update: {
          acao_id?: number
          contato_id?: string
          criado_em?: string
          etapa?: Database["public"]["Enums"]["aviso_etapa"]
          expira_em?: string
          feedback_restaurante_id?: number | null
          feedbacks_originais_ids?: string[]
          feedbacks_restaurante_ids?: number[]
          id?: string
          mensagem_id?: string | null
          restaurante_id?: number
          status?: Database["public"]["Enums"]["aviso_status"]
        }
        Relationships: [
          {
            foreignKeyName: "aviso_pendente_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_livres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_restaurante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_mensagem_fk"
            columns: ["mensagem_id"]
            isOneToOne: false
            referencedRelation: "mensagem_enviada"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_restaurante_id_fkey"
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
      contatos: {
        Row: {
          created_at: string
          id: string
          nome: string | null
          opt_out_em: string | null
          restaurante_id: number
          telefone: string
          ultimo_envio_em: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          nome?: string | null
          opt_out_em?: string | null
          restaurante_id: number
          telefone: string
          ultimo_envio_em?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string | null
          opt_out_em?: string | null
          restaurante_id?: number
          telefone?: string
          ultimo_envio_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contatos_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas: {
        Row: {
          arquivada: boolean
          created_at: string
          fixada: boolean
          id: string
          pasta_id: string | null
          restaurante_id: number
          sessao_origem: string | null
          titulo: string | null
          updated_at: string
          usuario_id: string
        }
        Insert: {
          arquivada?: boolean
          created_at?: string
          fixada?: boolean
          id?: string
          pasta_id?: string | null
          restaurante_id: number
          sessao_origem?: string | null
          titulo?: string | null
          updated_at?: string
          usuario_id: string
        }
        Update: {
          arquivada?: boolean
          created_at?: string
          fixada?: boolean
          id?: string
          pasta_id?: string | null
          restaurante_id?: number
          sessao_origem?: string | null
          titulo?: string | null
          updated_at?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversas_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "pastas_conversa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      conversas_chat: {
        Row: {
          atualizada_em: string
          created_at: string
          fixada: boolean
          id: string
          pasta_id: string | null
          restaurante_id: number
          sessao_id: string
          titulo: string | null
        }
        Insert: {
          atualizada_em?: string
          created_at?: string
          fixada?: boolean
          id?: string
          pasta_id?: string | null
          restaurante_id: number
          sessao_id: string
          titulo?: string | null
        }
        Update: {
          atualizada_em?: string
          created_at?: string
          fixada?: boolean
          id?: string
          pasta_id?: string | null
          restaurante_id?: number
          sessao_id?: string
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversas_chat_pasta_id_fkey"
            columns: ["pasta_id"]
            isOneToOne: false
            referencedRelation: "pastas_chat"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversas_chat_restaurante_id_fkey"
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
          vezes_uso_maximo: number | null
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
          vezes_uso_maximo?: number | null
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
          vezes_uso_maximo?: number | null
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
      documento_trechos: {
        Row: {
          conteudo: string
          created_at: string
          documento_id: string
          embedding: string | null
          id: string
          posicao: number
          restaurante_id: number | null
          tsv: unknown
        }
        Insert: {
          conteudo: string
          created_at?: string
          documento_id: string
          embedding?: string | null
          id?: string
          posicao?: number
          restaurante_id?: number | null
          tsv?: unknown
        }
        Update: {
          conteudo?: string
          created_at?: string
          documento_id?: string
          embedding?: string | null
          id?: string
          posicao?: number
          restaurante_id?: number | null
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "documento_trechos_documento_id_fkey"
            columns: ["documento_id"]
            isOneToOne: false
            referencedRelation: "documentos_ia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documento_trechos_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      documentos_ia: {
        Row: {
          arquivo_url: string | null
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
          arquivo_url?: string | null
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
          arquivo_url?: string | null
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
        Relationships: [
          {
            foreignKeyName: "documentos_ia_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_acao: {
        Row: {
          acao_id: number
          created_at: string
          feedback_original_id: string
          feedback_restaurante_id: number | null
          id: number
          restaurante_id: number
        }
        Insert: {
          acao_id: number
          created_at?: string
          feedback_original_id: string
          feedback_restaurante_id?: number | null
          id?: never
          restaurante_id: number
        }
        Update: {
          acao_id?: number
          created_at?: string
          feedback_original_id?: string
          feedback_restaurante_id?: number | null
          id?: never
          restaurante_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "feedback_acao_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_acao_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_originais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_acao_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_originais_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_acao_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: false
            referencedRelation: "fila_retorno_n8n"
            referencedColumns: ["feedback_original_id"]
          },
          {
            foreignKeyName: "feedback_acao_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_livres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_acao_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_restaurante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_acao_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_temas: {
        Row: {
          atualizado_em: string
          created_at: string
          id: string
          quantidade: number
          restaurante_id: number | null
          rotulo: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          created_at?: string
          id?: string
          quantidade?: number
          restaurante_id?: number | null
          rotulo: string
          tipo?: string
        }
        Update: {
          atualizado_em?: string
          created_at?: string
          id?: string
          quantidade?: number
          restaurante_id?: number | null
          rotulo?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_temas_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks_originais: {
        Row: {
          contato_id: string | null
          created_at: string
          id: string
          restaurante_id: number | null
          sentimento: string | null
          telefone_cliente: string | null
          texto_destacado: string | null
          texto_original: string | null
        }
        Insert: {
          contato_id?: string | null
          created_at?: string
          id?: string
          restaurante_id?: number | null
          sentimento?: string | null
          telefone_cliente?: string | null
          texto_destacado?: string | null
          texto_original?: string | null
        }
        Update: {
          contato_id?: string | null
          created_at?: string
          id?: string
          restaurante_id?: number | null
          sentimento?: string | null
          telefone_cliente?: string | null
          texto_destacado?: string | null
          texto_original?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_originais_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_originais_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks_restaurante: {
        Row: {
          categoria: string | null
          contato_id: string | null
          created_at: string
          id: number
          invalidado_em: string | null
          origem_id: string | null
          restaurante_id: number | null
          resumo: string | null
          sentimento: string | null
          telefone_cliente: string | null
          tema_id: string | null
          texto_original: string | null
          usado_em: string | null
          usado_por_acao_id: number | null
          usado_por_insight_id: string | null
        }
        Insert: {
          categoria?: string | null
          contato_id?: string | null
          created_at?: string
          id?: number
          invalidado_em?: string | null
          origem_id?: string | null
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          tema_id?: string | null
          texto_original?: string | null
          usado_em?: string | null
          usado_por_acao_id?: number | null
          usado_por_insight_id?: string | null
        }
        Update: {
          categoria?: string | null
          contato_id?: string | null
          created_at?: string
          id?: number
          invalidado_em?: string | null
          origem_id?: string | null
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          tema_id?: string | null
          texto_original?: string | null
          usado_em?: string | null
          usado_por_acao_id?: number | null
          usado_por_insight_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_restaurante_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_originais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_originais_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "fila_retorno_n8n"
            referencedColumns: ["feedback_original_id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "feedback_temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_usado_por_acao_id_fkey"
            columns: ["usado_por_acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_usado_por_insight_id_fkey"
            columns: ["usado_por_insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
        ]
      }
      garcons: {
        Row: {
          ativo: boolean | null
          bonus_pagamentos: Json
          created_at: string
          id: number
          nome_garcon: string | null
          restaurante_id: number | null
          telefone: string | null
        }
        Insert: {
          ativo?: boolean | null
          bonus_pagamentos?: Json
          created_at?: string
          id?: number
          nome_garcon?: string | null
          restaurante_id?: number | null
          telefone?: string | null
        }
        Update: {
          ativo?: boolean | null
          bonus_pagamentos?: Json
          created_at?: string
          id?: number
          nome_garcon?: string | null
          restaurante_id?: number | null
          telefone?: string | null
        }
        Relationships: []
      }
      ia_log_alteracoes: {
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
        Relationships: [
          {
            foreignKeyName: "acoes_ia_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_feedback: {
        Row: {
          created_at: string
          feedback_original_id: string | null
          feedback_restaurante_id: number
          insight_id: string
          origem: string
          restaurante_id: number
        }
        Insert: {
          created_at?: string
          feedback_original_id?: string | null
          feedback_restaurante_id: number
          insight_id: string
          origem?: string
          restaurante_id: number
        }
        Update: {
          created_at?: string
          feedback_original_id?: string | null
          feedback_restaurante_id?: number
          insight_id?: string
          origem?: string
          restaurante_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "insight_feedback_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_livres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_feedback_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_restaurante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_feedback_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_feedback_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      insight_feedbacks: {
        Row: {
          feedback_id: number
          insight_id: string
        }
        Insert: {
          feedback_id: number
          insight_id: string
        }
        Update: {
          feedback_id?: number
          insight_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "insight_feedbacks_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_livres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_feedbacks_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_restaurante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insight_feedbacks_insight_id_fkey"
            columns: ["insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
        ]
      }
      insights: {
        Row: {
          acao_id: number | null
          assunto_chave: string | null
          ativo: boolean | null
          categoria: string | null
          created_at: string | null
          deletado_em: string | null
          desativado_em: string | null
          descricao: string | null
          feedback_ids: string[]
          feedbacks_relacionados: number | null
          fixado: boolean
          gerado_por: string | null
          id: string
          motivo_encerramento: string | null
          pontos_ids: number[]
          prioridade: string
          restaurante_id: number | null
          sugestao: string | null
          titulo: string
        }
        Insert: {
          acao_id?: number | null
          assunto_chave?: string | null
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          deletado_em?: string | null
          desativado_em?: string | null
          descricao?: string | null
          feedback_ids?: string[]
          feedbacks_relacionados?: number | null
          fixado?: boolean
          gerado_por?: string | null
          id?: string
          motivo_encerramento?: string | null
          pontos_ids?: number[]
          prioridade: string
          restaurante_id?: number | null
          sugestao?: string | null
          titulo: string
        }
        Update: {
          acao_id?: number | null
          assunto_chave?: string | null
          ativo?: boolean | null
          categoria?: string | null
          created_at?: string | null
          deletado_em?: string | null
          desativado_em?: string | null
          descricao?: string | null
          feedback_ids?: string[]
          feedbacks_relacionados?: number | null
          fixado?: boolean
          gerado_por?: string | null
          id?: string
          motivo_encerramento?: string | null
          pontos_ids?: number[]
          prioridade?: string
          restaurante_id?: number | null
          sugestao?: string | null
          titulo?: string
        }
        Relationships: [
          {
            foreignKeyName: "insights_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "insights_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: [
          {
            foreignKeyName: "memoria_assistente_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagem_enviada: {
        Row: {
          contato_id: string
          criado_em: string
          enviado_em: string | null
          erro_codigo: string | null
          erro_mensagem: string | null
          feedbacks_originais_ids: string[]
          feedbacks_restaurante_ids: number[]
          id: string
          provider_message_id: string | null
          restaurante_id: number
          status: string
          texto: string
        }
        Insert: {
          contato_id: string
          criado_em?: string
          enviado_em?: string | null
          erro_codigo?: string | null
          erro_mensagem?: string | null
          feedbacks_originais_ids?: string[]
          feedbacks_restaurante_ids?: number[]
          id?: string
          provider_message_id?: string | null
          restaurante_id: number
          status?: string
          texto: string
        }
        Update: {
          contato_id?: string
          criado_em?: string
          enviado_em?: string | null
          erro_codigo?: string | null
          erro_mensagem?: string | null
          feedbacks_originais_ids?: string[]
          feedbacks_restaurante_ids?: number[]
          id?: string
          provider_message_id?: string | null
          restaurante_id?: number
          status?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "mensagem_enviada_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mensagem_enviada_restaurante_id_fkey"
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
          conversa_id: string | null
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
          conversa_id?: string | null
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
          conversa_id?: string | null
          created_at?: string | null
          id?: string
          mensagem?: string
          papel?: string
          sessao_id?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_chat_conversa_id_fkey"
            columns: ["conversa_id"]
            isOneToOne: false
            referencedRelation: "conversas"
            referencedColumns: ["id"]
          },
        ]
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
      modelos_ia: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          modelo: string
          nome: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          modelo: string
          nome: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          modelo?: string
          nome?: string
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
      pastas_chat: {
        Row: {
          created_at: string
          id: string
          nome: string
          ordem: number
          restaurante_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          restaurante_id: number
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          restaurante_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pastas_chat_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      pastas_conversa: {
        Row: {
          created_at: string
          id: string
          nome: string
          ordem: number
          restaurante_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          ordem?: number
          restaurante_id: number
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          ordem?: number
          restaurante_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "pastas_conversa_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
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
      prompts_editaveis: {
        Row: {
          chave: string
          conteudo: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          chave: string
          conteudo: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          chave?: string
          conteudo?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          auth_user_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          auth_user_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          auth_user_id?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: []
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
            foreignKeyName: "qr_codes_garcom_id_fkey"
            columns: ["garcom_id"]
            isOneToOne: false
            referencedRelation: "garcons"
            referencedColumns: ["id"]
          },
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
        Relationships: [
          {
            foreignKeyName: "reacoes_sugestoes_sugestao_id_fkey"
            columns: ["sugestao_id"]
            isOneToOne: false
            referencedRelation: "sugestoes_plataforma"
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
        Relationships: [
          {
            foreignKeyName: "respostas_sugestoes_sugestao_id_fkey"
            columns: ["sugestao_id"]
            isOneToOne: false
            referencedRelation: "sugestoes_plataforma"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurantes: {
        Row: {
          assinatura_cancelada_em: string | null
          assinatura_expira_em: string | null
          assinatura_status: string
          auth_user_id: string
          config_bonificacao: Json
          config_insights: Json | null
          created_at: string
          credito_ia_ciclo_inicio: string
          credito_ia_limite_usd: number
          detalhes: string | null
          excluida_em: string | null
          frequencia_relatorios: string | null
          funcoes_config: Json | null
          ia_modo_acao: string
          id: number
          logo_url: string | null
          mascote_config: Json | null
          metodo_coleta_feedback: string | null
          nome_restaurante: string | null
          numero_mesas: number | null
          numero_whatsapp: string | null
          onboarding_completo: boolean
          perfil_restaurante: Json
          plano_ciclo: string | null
          qr_bg_imagem: string | null
          qr_bg_modo: string | null
          qr_estilo: string | null
          qr_filtro: string | null
          qr_mensagem: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          texto_banner: string | null
          tipo_culinaria: string | null
          ultima_analise_insights: string | null
          ultima_atualizacao_banner: string | null
          whatsapp_admin_token: string | null
          whatsapp_base_url: string | null
          whatsapp_token: string | null
        }
        Insert: {
          assinatura_cancelada_em?: string | null
          assinatura_expira_em?: string | null
          assinatura_status?: string
          auth_user_id: string
          config_bonificacao?: Json
          config_insights?: Json | null
          created_at?: string
          credito_ia_ciclo_inicio?: string
          credito_ia_limite_usd?: number
          detalhes?: string | null
          excluida_em?: string | null
          frequencia_relatorios?: string | null
          funcoes_config?: Json | null
          ia_modo_acao?: string
          id?: number
          logo_url?: string | null
          mascote_config?: Json | null
          metodo_coleta_feedback?: string | null
          nome_restaurante?: string | null
          numero_mesas?: number | null
          numero_whatsapp?: string | null
          onboarding_completo?: boolean
          perfil_restaurante?: Json
          plano_ciclo?: string | null
          qr_bg_imagem?: string | null
          qr_bg_modo?: string | null
          qr_estilo?: string | null
          qr_filtro?: string | null
          qr_mensagem?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          texto_banner?: string | null
          tipo_culinaria?: string | null
          ultima_analise_insights?: string | null
          ultima_atualizacao_banner?: string | null
          whatsapp_admin_token?: string | null
          whatsapp_base_url?: string | null
          whatsapp_token?: string | null
        }
        Update: {
          assinatura_cancelada_em?: string | null
          assinatura_expira_em?: string | null
          assinatura_status?: string
          auth_user_id?: string
          config_bonificacao?: Json
          config_insights?: Json | null
          created_at?: string
          credito_ia_ciclo_inicio?: string
          credito_ia_limite_usd?: number
          detalhes?: string | null
          excluida_em?: string | null
          frequencia_relatorios?: string | null
          funcoes_config?: Json | null
          ia_modo_acao?: string
          id?: number
          logo_url?: string | null
          mascote_config?: Json | null
          metodo_coleta_feedback?: string | null
          nome_restaurante?: string | null
          numero_mesas?: number | null
          numero_whatsapp?: string | null
          onboarding_completo?: boolean
          perfil_restaurante?: Json
          plano_ciclo?: string | null
          qr_bg_imagem?: string | null
          qr_bg_modo?: string | null
          qr_estilo?: string | null
          qr_filtro?: string | null
          qr_mensagem?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          texto_banner?: string | null
          tipo_culinaria?: string | null
          ultima_analise_insights?: string | null
          ultima_atualizacao_banner?: string | null
          whatsapp_admin_token?: string | null
          whatsapp_base_url?: string | null
          whatsapp_token?: string | null
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
      uso_ia: {
        Row: {
          agente_id: string | null
          completion_tokens: number | null
          created_at: string
          custo_usd: number
          id: string
          modelo: string | null
          origem: string
          prompt_tokens: number | null
          restaurante_id: number | null
        }
        Insert: {
          agente_id?: string | null
          completion_tokens?: number | null
          created_at?: string
          custo_usd?: number
          id?: string
          modelo?: string | null
          origem: string
          prompt_tokens?: number | null
          restaurante_id?: number | null
        }
        Update: {
          agente_id?: string | null
          completion_tokens?: number | null
          created_at?: string
          custo_usd?: number
          id?: string
          modelo?: string | null
          origem?: string
          prompt_tokens?: number | null
          restaurante_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "uso_ia_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios: {
        Row: {
          avatar_url: string | null
          cargo: string
          configuracoes: Json | null
          created_at: string
          email: string | null
          id: string
          nome: string | null
          perfil_notas: string | null
          restaurante_id: number
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          cargo?: string
          configuracoes?: Json | null
          created_at?: string
          email?: string | null
          id: string
          nome?: string | null
          perfil_notas?: string | null
          restaurante_id: number
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          cargo?: string
          configuracoes?: Json | null
          created_at?: string
          email?: string | null
          id?: string
          nome?: string | null
          perfil_notas?: string | null
          restaurante_id?: number
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usuarios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      feedbacks_livres: {
        Row: {
          categoria: string | null
          contato_id: string | null
          created_at: string | null
          id: number | null
          invalidado_em: string | null
          origem_id: string | null
          restaurante_id: number | null
          resumo: string | null
          sentimento: string | null
          telefone_cliente: string | null
          tema_id: string | null
          texto_original: string | null
          usado_em: string | null
          usado_por_acao_id: number | null
          usado_por_insight_id: string | null
        }
        Insert: {
          categoria?: string | null
          contato_id?: string | null
          created_at?: string | null
          id?: number | null
          invalidado_em?: string | null
          origem_id?: string | null
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          tema_id?: string | null
          texto_original?: string | null
          usado_em?: string | null
          usado_por_acao_id?: number | null
          usado_por_insight_id?: string | null
        }
        Update: {
          categoria?: string | null
          contato_id?: string | null
          created_at?: string | null
          id?: number | null
          invalidado_em?: string | null
          origem_id?: string | null
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          tema_id?: string | null
          texto_original?: string | null
          usado_em?: string | null
          usado_por_acao_id?: number | null
          usado_por_insight_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_restaurante_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_originais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_originais_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_origem_id_fkey"
            columns: ["origem_id"]
            isOneToOne: false
            referencedRelation: "fila_retorno_n8n"
            referencedColumns: ["feedback_original_id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_tema_id_fkey"
            columns: ["tema_id"]
            isOneToOne: false
            referencedRelation: "feedback_temas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_usado_por_acao_id_fkey"
            columns: ["usado_por_acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedbacks_restaurante_usado_por_insight_id_fkey"
            columns: ["usado_por_insight_id"]
            isOneToOne: false
            referencedRelation: "insights"
            referencedColumns: ["id"]
          },
        ]
      }
      feedbacks_originais_view: {
        Row: {
          categorias: string[] | null
          created_at: string | null
          id: string | null
          restaurante_id: number | null
          sentimento: string | null
          telefone_cliente: string | null
          texto_destacado: string | null
          texto_exibicao: string | null
          texto_original: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedbacks_originais_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      fila_retorno_n8n: {
        Row: {
          acao_id: number | null
          aviso_em: string | null
          aviso_id: string | null
          categoria: string | null
          categoria_do_ponto: string | null
          contato_id: string | null
          etapa: Database["public"]["Enums"]["aviso_etapa"] | null
          feedback_em: string | null
          feedback_original_id: string | null
          feedback_restaurante_id: number | null
          nome_cliente: string | null
          nome_restaurante: string | null
          plano_detalhado: string | null
          restaurante_id: number | null
          telefone: string | null
          texto_do_ponto: string | null
          titulo_acao: string | null
          ultimo_envio_em: string | null
          whatsapp_base_url: string | null
          whatsapp_token: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aviso_pendente_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_contato_id_fkey"
            columns: ["contato_id"]
            isOneToOne: false
            referencedRelation: "contatos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_livres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_restaurante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aviso_pendente_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_push_subscriptions: {
        Args: never
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
        }[]
      }
      arquivar_concluidas_antigas: { Args: never; Returns: number }
      assinaturas_expirar_e_listar: {
        Args: never
        Returns: {
          id: number
          whatsapp_base_url: string
          whatsapp_token: string
        }[]
      }
      ativar_modelo_ia: { Args: { p_id: string }; Returns: undefined }
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
      conferir_contatos_cruzados: {
        Args: never
        Returns: {
          contato_id: string
          dono_do_contato: number
          dono_do_registro: number
          registro: string
          tabela: string
        }[]
      }
      consumir_credito_ia: {
        Args: { p_custo?: number; p_restaurante_id: number }
        Returns: {
          ciclo_inicio: string
          gasto: number
          limite: number
          permitido: boolean
        }[]
      }
      deve_gerar_insights: {
        Args: { p_restaurante_id: number }
        Returns: {
          deve: boolean
          livres_novos: number
          necessarios: number
        }[]
      }
      expirar_assinaturas: { Args: never; Returns: number }
      feedbacks_para_geracao: {
        Args: { p_dias?: number; p_restaurante_id: number }
        Returns: {
          categoria: string | null
          contato_id: string | null
          created_at: string
          id: number
          invalidado_em: string | null
          origem_id: string | null
          restaurante_id: number | null
          resumo: string | null
          sentimento: string | null
          telefone_cliente: string | null
          tema_id: string | null
          texto_original: string | null
          usado_em: string | null
          usado_por_acao_id: number | null
          usado_por_insight_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "feedbacks_restaurante"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_restaurante_id: { Args: never; Returns: number }
      limpar_contas_abandonadas: { Args: never; Returns: number }
      meu_uso_ia: {
        Args: never
        Returns: {
          ciclo_inicio: string
          gasto: number
          limite: number
        }[]
      }
      normalizar_telefone: { Args: { p: string }; Returns: string }
      ordem_status_acao:
        | {
            Args: { p_etapa: Database["public"]["Enums"]["aviso_etapa"] }
            Returns: number
          }
        | { Args: { p_status: string }; Returns: number }
      promover_transicoes_pendentes: {
        Args: never
        Returns: {
          avisos_criados: number
          canceladas: number
          promovidas: number
        }[]
      }
      reconciliar_uso_feedbacks: {
        Args: { p_restaurante_id?: number }
        Returns: {
          corrigidos: number
        }[]
      }
      registrar_envio_retorno: {
        Args: {
          p_aviso_ids: string[]
          p_contato_id: string
          p_provider_message_id?: string
          p_texto: string
        }
        Returns: string
      }
      temas_agrupados: {
        Args: { p_desde?: string; p_restaurante_id: number; p_tipo?: string }
        Returns: {
          id: string
          quantidade: number
          rotulo: string
          tipo: string
        }[]
      }
    }
    Enums: {
      aviso_etapa: "em_andamento" | "concluida"
      aviso_status: "na_fila" | "enviado" | "cancelado" | "expirado"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      aviso_etapa: ["em_andamento", "concluida"],
      aviso_status: ["na_fila", "enviado", "cancelado", "expirado"],
    },
  },
} as const
