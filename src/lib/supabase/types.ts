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
      acessos_admin: {
        Row: {
          admin_email: string
          admin_user_id: string
          alvo_user_id: string
          encerrado_em: string | null
          id: string
          iniciado_em: string
          restaurante_id: number
          session_id: string | null
        }
        Insert: {
          admin_email: string
          admin_user_id: string
          alvo_user_id: string
          encerrado_em?: string | null
          id?: string
          iniciado_em?: string
          restaurante_id: number
          session_id?: string | null
        }
        Update: {
          admin_email?: string
          admin_user_id?: string
          alvo_user_id?: string
          encerrado_em?: string | null
          id?: string
          iniciado_em?: string
          restaurante_id?: number
          session_id?: string | null
        }
        Relationships: []
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
          publico: string
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
          publico?: string
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
          publico?: string
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
      admins_parceiros: {
        Row: {
          criado_em: string
          email: string
          nome: string | null
        }
        Insert: {
          criado_em?: string
          email: string
          nome?: string | null
        }
        Update: {
          criado_em?: string
          email?: string
          nome?: string | null
        }
        Relationships: []
      }
      afiliado_config: {
        Row: {
          area: string
          atualizado_em: string
          atualizado_por: string | null
          comissao_padrao: number
        }
        Insert: {
          area: string
          atualizado_em?: string
          atualizado_por?: string | null
          comissao_padrao?: number
        }
        Update: {
          area?: string
          atualizado_em?: string
          atualizado_por?: string | null
          comissao_padrao?: number
        }
        Relationships: []
      }
      afiliados: {
        Row: {
          agencia: string | null
          area: string
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
          restaurante_id: number | null
          telefone: string | null
          tipo_conta: string | null
        }
        Insert: {
          agencia?: string | null
          area?: string
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
          restaurante_id?: number | null
          telefone?: string | null
          tipo_conta?: string | null
        }
        Update: {
          agencia?: string | null
          area?: string
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
          restaurante_id?: number | null
          telefone?: string | null
          tipo_conta?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "afiliados_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
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
      alerta_urgente: {
        Row: {
          created_at: string
          enviado_em: string | null
          erro: string | null
          feedback_original_id: string
          feedback_restaurante_id: number | null
          id: number
          motivo: string | null
          restaurante_id: number
          termos: string[]
        }
        Insert: {
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          feedback_original_id: string
          feedback_restaurante_id?: number | null
          id?: never
          motivo?: string | null
          restaurante_id: number
          termos?: string[]
        }
        Update: {
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          feedback_original_id?: string
          feedback_restaurante_id?: number | null
          id?: never
          motivo?: string | null
          restaurante_id?: number
          termos?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "alerta_urgente_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: true
            referencedRelation: "feedbacks_originais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerta_urgente_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: true
            referencedRelation: "feedbacks_originais_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerta_urgente_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: true
            referencedRelation: "fila_retorno_n8n"
            referencedColumns: ["feedback_original_id"]
          },
          {
            foreignKeyName: "alerta_urgente_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_livres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerta_urgente_feedback_restaurante_id_fkey"
            columns: ["feedback_restaurante_id"]
            isOneToOne: false
            referencedRelation: "feedbacks_restaurante"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerta_urgente_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      area_config: {
        Row: {
          atualizado_em: string
          atualizado_por: string | null
          id: boolean
          rh_convite: string
          rh_modo: string
        }
        Insert: {
          atualizado_em?: string
          atualizado_por?: string | null
          id?: boolean
          rh_convite?: string
          rh_modo?: string
        }
        Update: {
          atualizado_em?: string
          atualizado_por?: string | null
          id?: boolean
          rh_convite?: string
          rh_modo?: string
        }
        Relationships: []
      }
      autorizacoes_marketing: {
        Row: {
          atualizado_em: string
          autorizado_em: string
          autorizado_por: string
          canal: string
          observacao: string | null
          origem: string
          pode_depoimento: boolean
          pode_logo: boolean
          pode_nome: boolean
          pode_numeros: boolean
          registrado_por: string
          restaurante_id: number
          revogado_em: string | null
          status: string
          versao_texto: string | null
        }
        Insert: {
          atualizado_em?: string
          autorizado_em?: string
          autorizado_por: string
          canal: string
          observacao?: string | null
          origem?: string
          pode_depoimento?: boolean
          pode_logo?: boolean
          pode_nome?: boolean
          pode_numeros?: boolean
          registrado_por?: string
          restaurante_id: number
          revogado_em?: string | null
          status?: string
          versao_texto?: string | null
        }
        Update: {
          atualizado_em?: string
          autorizado_em?: string
          autorizado_por?: string
          canal?: string
          observacao?: string | null
          origem?: string
          pode_depoimento?: boolean
          pode_logo?: boolean
          pode_nome?: boolean
          pode_numeros?: boolean
          registrado_por?: string
          restaurante_id?: number
          revogado_em?: string | null
          status?: string
          versao_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autorizacoes_marketing_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: true
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      autorizacoes_marketing_historico: {
        Row: {
          autorizado_por: string
          canal: string
          criado_em: string
          id: number
          observacao: string | null
          origem: string
          pode_depoimento: boolean
          pode_logo: boolean
          pode_nome: boolean
          pode_numeros: boolean
          registrado_por: string | null
          restaurante_id: number
          status: string
          versao_texto: string | null
        }
        Insert: {
          autorizado_por: string
          canal: string
          criado_em?: string
          id?: never
          observacao?: string | null
          origem: string
          pode_depoimento: boolean
          pode_logo: boolean
          pode_nome: boolean
          pode_numeros: boolean
          registrado_por?: string | null
          restaurante_id: number
          status: string
          versao_texto?: string | null
        }
        Update: {
          autorizado_por?: string
          canal?: string
          criado_em?: string
          id?: never
          observacao?: string | null
          origem?: string
          pode_depoimento?: boolean
          pode_logo?: boolean
          pode_nome?: boolean
          pode_numeros?: boolean
          registrado_por?: string | null
          restaurante_id?: number
          status?: string
          versao_texto?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "autorizacoes_marketing_historico_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      aviso_pendente: {
        Row: {
          acao_id: number
          categoria: string | null
          concluida_em: string | null
          contato_id: string
          criado_em: string
          etapa: Database["public"]["Enums"]["aviso_etapa"]
          expira_em: string
          feedback_restaurante_id: number
          id: string
          mensagem_id: string | null
          plano_detalhado: string | null
          prioridade: string | null
          restaurante_id: number
          status: Database["public"]["Enums"]["aviso_status"]
          titulo_acao: string | null
        }
        Insert: {
          acao_id: number
          categoria?: string | null
          concluida_em?: string | null
          contato_id: string
          criado_em?: string
          etapa: Database["public"]["Enums"]["aviso_etapa"]
          expira_em: string
          feedback_restaurante_id: number
          id?: string
          mensagem_id?: string | null
          plano_detalhado?: string | null
          prioridade?: string | null
          restaurante_id: number
          status?: Database["public"]["Enums"]["aviso_status"]
          titulo_acao?: string | null
        }
        Update: {
          acao_id?: number
          categoria?: string | null
          concluida_em?: string | null
          contato_id?: string
          criado_em?: string
          etapa?: Database["public"]["Enums"]["aviso_etapa"]
          expira_em?: string
          feedback_restaurante_id?: number
          id?: string
          mensagem_id?: string | null
          plano_detalhado?: string | null
          prioridade?: string | null
          restaurante_id?: number
          status?: Database["public"]["Enums"]["aviso_status"]
          titulo_acao?: string | null
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
      bonificacao_marco: {
        Row: {
          created_at: string
          enviado_em: string | null
          erro: string | null
          garcom_id: number
          id: number
          marco: number
          periodo_inicio: string
          regra_id: string
          restaurante_id: number
        }
        Insert: {
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          garcom_id: number
          id?: never
          marco: number
          periodo_inicio: string
          regra_id: string
          restaurante_id: number
        }
        Update: {
          created_at?: string
          enviado_em?: string | null
          erro?: string | null
          garcom_id?: number
          id?: never
          marco?: number
          periodo_inicio?: string
          regra_id?: string
          restaurante_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "bonificacao_marco_garcom_id_fkey"
            columns: ["garcom_id"]
            isOneToOne: false
            referencedRelation: "garcons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonificacao_marco_restaurante_id_fkey"
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
          atualizado_em: string
          cor: string | null
          created_at: string | null
          descricao: string | null
          icone: string | null
          id: string
          nome: string
          ordem: number
          publico: string
          restaurante_id: number | null
        }
        Insert: {
          ativa?: boolean | null
          atualizado_em?: string
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome: string
          ordem?: number
          publico?: string
          restaurante_id?: number | null
        }
        Update: {
          ativa?: boolean | null
          atualizado_em?: string
          cor?: string | null
          created_at?: string | null
          descricao?: string | null
          icone?: string | null
          id?: string
          nome?: string
          ordem?: number
          publico?: string
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
      cobranca_assinaturas: {
        Row: {
          afiliado_id: string | null
          area: string
          asaas_customer_id: string
          asaas_id: string | null
          atualizada_em: string
          cancelada_em: string | null
          ciclo: string
          conta_id: string
          criada_em: string
          cupom_uso_id: string | null
          id: string
          modalidade: string
          parcelas: number | null
          periodo_fim: string | null
          primeira_cobranca_centavos: number | null
          restaurante_id: number | null
          status: string
          termos_versao: string | null
          valor_centavos: number
        }
        Insert: {
          afiliado_id?: string | null
          area?: string
          asaas_customer_id: string
          asaas_id?: string | null
          atualizada_em?: string
          cancelada_em?: string | null
          ciclo: string
          conta_id: string
          criada_em?: string
          cupom_uso_id?: string | null
          id?: string
          modalidade: string
          parcelas?: number | null
          periodo_fim?: string | null
          primeira_cobranca_centavos?: number | null
          restaurante_id?: number | null
          status?: string
          termos_versao?: string | null
          valor_centavos: number
        }
        Update: {
          afiliado_id?: string | null
          area?: string
          asaas_customer_id?: string
          asaas_id?: string | null
          atualizada_em?: string
          cancelada_em?: string | null
          ciclo?: string
          conta_id?: string
          criada_em?: string
          cupom_uso_id?: string | null
          id?: string
          modalidade?: string
          parcelas?: number | null
          periodo_fim?: string | null
          primeira_cobranca_centavos?: number | null
          restaurante_id?: number | null
          status?: string
          termos_versao?: string | null
          valor_centavos?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_assinaturas_afiliado_id_fkey"
            columns: ["afiliado_id"]
            isOneToOne: false
            referencedRelation: "afiliados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_assinaturas_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_cobranca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_assinaturas_cupom_uso_id_fkey"
            columns: ["cupom_uso_id"]
            isOneToOne: false
            referencedRelation: "cupons_usos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_assinaturas_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_clientes: {
        Row: {
          asaas_customer_id: string
          conta_id: string
          cpf_cnpj: string
          criado_em: string
          id: string
          restaurante_id: number
        }
        Insert: {
          asaas_customer_id: string
          conta_id: string
          cpf_cnpj: string
          criado_em?: string
          id?: string
          restaurante_id: number
        }
        Update: {
          asaas_customer_id?: string
          conta_id?: string
          cpf_cnpj?: string
          criado_em?: string
          id?: string
          restaurante_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_clientes_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_cobranca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_clientes_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_eventos_webhook: {
        Row: {
          conta_id: string
          erro: string | null
          event_id: string
          payload: Json | null
          processado_em: string | null
          recebido_em: string
          status: string
          tipo: string
        }
        Insert: {
          conta_id: string
          erro?: string | null
          event_id: string
          payload?: Json | null
          processado_em?: string | null
          recebido_em?: string
          status?: string
          tipo: string
        }
        Update: {
          conta_id?: string
          erro?: string | null
          event_id?: string
          payload?: Json | null
          processado_em?: string | null
          recebido_em?: string
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_eventos_webhook_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_cobranca"
            referencedColumns: ["id"]
          },
        ]
      }
      cobranca_pagamentos: {
        Row: {
          asaas_payment_id: string
          assinatura_id: string | null
          atualizado_em: string
          conta_id: string
          credito_em: string | null
          criado_em: string
          cupom_uso_id: string | null
          id: string
          invoice_url: string | null
          liquido_centavos: number | null
          numero_parcela: number | null
          pago_em: string | null
          premio_id: string | null
          restaurante_id: number | null
          status: string
          valor_centavos: number
          vencimento: string | null
        }
        Insert: {
          asaas_payment_id: string
          assinatura_id?: string | null
          atualizado_em?: string
          conta_id: string
          credito_em?: string | null
          criado_em?: string
          cupom_uso_id?: string | null
          id?: string
          invoice_url?: string | null
          liquido_centavos?: number | null
          numero_parcela?: number | null
          pago_em?: string | null
          premio_id?: string | null
          restaurante_id?: number | null
          status: string
          valor_centavos: number
          vencimento?: string | null
        }
        Update: {
          asaas_payment_id?: string
          assinatura_id?: string | null
          atualizado_em?: string
          conta_id?: string
          credito_em?: string | null
          criado_em?: string
          cupom_uso_id?: string | null
          id?: string
          invoice_url?: string | null
          liquido_centavos?: number | null
          numero_parcela?: number | null
          pago_em?: string | null
          premio_id?: string | null
          restaurante_id?: number | null
          status?: string
          valor_centavos?: number
          vencimento?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cobranca_pagamentos_assinatura_id_fkey"
            columns: ["assinatura_id"]
            isOneToOne: false
            referencedRelation: "cobranca_assinaturas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_pagamentos_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_cobranca"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_pagamentos_cupom_uso_id_fkey"
            columns: ["cupom_uso_id"]
            isOneToOne: false
            referencedRelation: "cupons_usos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_pagamentos_premio_id_fkey"
            columns: ["premio_id"]
            isOneToOne: false
            referencedRelation: "indicacao_premios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cobranca_pagamentos_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      contas_cobranca: {
        Row: {
          ambiente: string
          ativa: boolean
          criado_em: string
          id: string
          nome: string
          recebe_novas_vendas: boolean
        }
        Insert: {
          ambiente?: string
          ativa?: boolean
          criado_em?: string
          id: string
          nome: string
          recebe_novas_vendas?: boolean
        }
        Update: {
          ambiente?: string
          ativa?: boolean
          criado_em?: string
          id?: string
          nome?: string
          recebe_novas_vendas?: boolean
        }
        Relationships: []
      }
      contatos: {
        Row: {
          aviso_parar_em: string | null
          created_at: string
          id: string
          opt_out_em: string | null
          opt_out_motivo: string | null
          restaurante_id: number
          telefone: string
          ultimo_envio_em: string | null
        }
        Insert: {
          aviso_parar_em?: string | null
          created_at?: string
          id?: string
          opt_out_em?: string | null
          opt_out_motivo?: string | null
          restaurante_id: number
          telefone: string
          ultimo_envio_em?: string | null
        }
        Update: {
          aviso_parar_em?: string | null
          created_at?: string
          id?: string
          opt_out_em?: string | null
          opt_out_motivo?: string | null
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
          area: string
          ativo: boolean | null
          created_at: string
          cupom: string | null
          data_expiracao: string | null
          dias_validade: number | null
          id: number
          porcentagem_desconto: number | null
          somente_vendedores: boolean
          tipo_conta: string
          valor_desconto: number | null
          vezes_usado: number
          vezes_uso_maximo: number | null
        }
        Insert: {
          area?: string
          ativo?: boolean | null
          created_at?: string
          cupom?: string | null
          data_expiracao?: string | null
          dias_validade?: number | null
          id?: number
          porcentagem_desconto?: number | null
          somente_vendedores?: boolean
          tipo_conta?: string
          valor_desconto?: number | null
          vezes_usado?: number
          vezes_uso_maximo?: number | null
        }
        Update: {
          area?: string
          ativo?: boolean | null
          created_at?: string
          cupom?: string | null
          data_expiracao?: string | null
          dias_validade?: number | null
          id?: number
          porcentagem_desconto?: number | null
          somente_vendedores?: boolean
          tipo_conta?: string
          valor_desconto?: number | null
          vezes_usado?: number
          vezes_uso_maximo?: number | null
        }
        Relationships: []
      }
      cupons_usos: {
        Row: {
          aplicado_em: string | null
          aplicado_pagamento: string | null
          area: string
          cupom: string
          cupom_id: number | null
          dias_validade: number | null
          email: string | null
          id: string
          porcentagem_desconto: number | null
          restaurante_id: number | null
          tipo_conta: string
          usado_em: string
          valor_desconto: number | null
        }
        Insert: {
          aplicado_em?: string | null
          aplicado_pagamento?: string | null
          area?: string
          cupom: string
          cupom_id?: number | null
          dias_validade?: number | null
          email?: string | null
          id?: string
          porcentagem_desconto?: number | null
          restaurante_id?: number | null
          tipo_conta?: string
          usado_em?: string
          valor_desconto?: number | null
        }
        Update: {
          aplicado_em?: string | null
          aplicado_pagamento?: string | null
          area?: string
          cupom?: string
          cupom_id?: number | null
          dias_validade?: number | null
          email?: string | null
          id?: string
          porcentagem_desconto?: number | null
          restaurante_id?: number | null
          tipo_conta?: string
          usado_em?: string
          valor_desconto?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cupons_usos_cupom_id_fkey"
            columns: ["cupom_id"]
            isOneToOne: false
            referencedRelation: "cupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cupons_usos_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_tentativas: {
        Row: {
          acertou: boolean
          criado_em: string
          id: number
          ip: string
        }
        Insert: {
          acertou: boolean
          criado_em?: string
          id?: never
          ip: string
        }
        Update: {
          acertou?: boolean
          criado_em?: string
          id?: never
          ip?: string
        }
        Relationships: []
      }
      divisao_receita: {
        Row: {
          area: string
          ativo: boolean | null
          chave_pix: string | null
          created_at: string | null
          id: string
          nome: string
          recebedor_id: string | null
          tipo: string
          valor: number
        }
        Insert: {
          area?: string
          ativo?: boolean | null
          chave_pix?: string | null
          created_at?: string | null
          id?: string
          nome: string
          recebedor_id?: string | null
          tipo: string
          valor: number
        }
        Update: {
          area?: string
          ativo?: boolean | null
          chave_pix?: string | null
          created_at?: string | null
          id?: string
          nome?: string
          recebedor_id?: string | null
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "divisao_receita_recebedor_id_fkey"
            columns: ["recebedor_id"]
            isOneToOne: false
            referencedRelation: "recebedores"
            referencedColumns: ["id"]
          },
        ]
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
          area: string
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
          area?: string
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
          area?: string
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
      equipe_automatico: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          cada_dias: number
          dia_do_mes: number | null
          pergunta: string
          proximo_em: string | null
          restaurante_id: number
          ultimo_em: string | null
          ultimo_erro: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cada_dias?: number
          dia_do_mes?: number | null
          pergunta: string
          proximo_em?: string | null
          restaurante_id: number
          ultimo_em?: string | null
          ultimo_erro?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cada_dias?: number
          dia_do_mes?: number | null
          pergunta?: string
          proximo_em?: string | null
          restaurante_id?: number
          ultimo_em?: string | null
          ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_automatico_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: true
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_autorias: {
        Row: {
          criado_em: string
          decidido_em: string | null
          decidido_por: string | null
          envio_id: number | null
          feedback_original_id: string
          funcionario_id: number | null
          id: string
          identidade: string
          identidade_ate: string | null
          janela_inicio: string
          perguntado_em: string | null
          restaurante_id: number
          sensivel: boolean
        }
        Insert: {
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          envio_id?: number | null
          feedback_original_id: string
          funcionario_id?: number | null
          id?: string
          identidade?: string
          identidade_ate?: string | null
          janela_inicio?: string
          perguntado_em?: string | null
          restaurante_id: number
          sensivel?: boolean
        }
        Update: {
          criado_em?: string
          decidido_em?: string | null
          decidido_por?: string | null
          envio_id?: number | null
          feedback_original_id?: string
          funcionario_id?: number | null
          id?: string
          identidade?: string
          identidade_ate?: string | null
          janela_inicio?: string
          perguntado_em?: string | null
          restaurante_id?: number
          sensivel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "equipe_autorias_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "equipe_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_autorias_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: true
            referencedRelation: "feedbacks_originais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_autorias_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: true
            referencedRelation: "feedbacks_originais_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_autorias_feedback_original_id_fkey"
            columns: ["feedback_original_id"]
            isOneToOne: true
            referencedRelation: "fila_retorno_n8n"
            referencedColumns: ["feedback_original_id"]
          },
          {
            foreignKeyName: "equipe_autorias_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "equipe_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_autorias_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_convites: {
        Row: {
          criado_em: string
          enviado_em: string | null
          envio_id: number
          erro: string | null
          funcionario_id: number | null
          id: number
          message_id: string | null
          respondeu_em: string | null
          restaurante_id: number
          status: string
          telefone: string
          tentou_em: string | null
          texto: string
        }
        Insert: {
          criado_em?: string
          enviado_em?: string | null
          envio_id: number
          erro?: string | null
          funcionario_id?: number | null
          id?: never
          message_id?: string | null
          respondeu_em?: string | null
          restaurante_id: number
          status?: string
          telefone: string
          tentou_em?: string | null
          texto: string
        }
        Update: {
          criado_em?: string
          enviado_em?: string | null
          envio_id?: number
          erro?: string | null
          funcionario_id?: number | null
          id?: never
          message_id?: string | null
          respondeu_em?: string | null
          restaurante_id?: number
          status?: string
          telefone?: string
          tentou_em?: string | null
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_convites_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "equipe_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_convites_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "equipe_funcionarios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_convites_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_envios: {
        Row: {
          acao_id: number | null
          concluido_em: string | null
          criado_em: string
          criado_por: string
          id: number
          pergunta: string
          regra_id: number | null
          restaurante_id: number
          status: string
          tipo: string
        }
        Insert: {
          acao_id?: number | null
          concluido_em?: string | null
          criado_em?: string
          criado_por?: string
          id?: never
          pergunta: string
          regra_id?: number | null
          restaurante_id: number
          status?: string
          tipo?: string
        }
        Update: {
          acao_id?: number | null
          concluido_em?: string | null
          criado_em?: string
          criado_por?: string
          id?: never
          pergunta?: string
          regra_id?: number | null
          restaurante_id?: number
          status?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_envios_acao_id_fkey"
            columns: ["acao_id"]
            isOneToOne: false
            referencedRelation: "acoes_operacionais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_envios_regra_id_fkey"
            columns: ["regra_id"]
            isOneToOne: false
            referencedRelation: "equipe_regras_pedido"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipe_envios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_funcionarios: {
        Row: {
          ativo: boolean
          atualizado_em: string
          criado_em: string
          funcao: string
          id: number
          nome: string
          opt_out_em: string | null
          opt_out_motivo: string | null
          restaurante_id: number
          telefone: string
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          funcao?: string
          id?: never
          nome: string
          opt_out_em?: string | null
          opt_out_motivo?: string | null
          restaurante_id: number
          telefone: string
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          funcao?: string
          id?: never
          nome?: string
          opt_out_em?: string | null
          opt_out_motivo?: string | null
          restaurante_id?: number
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipe_funcionarios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      equipe_regras_pedido: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          cada_dias: number
          criado_em: string
          dia_do_mes: number | null
          funcionarios: number[]
          id: number
          nome: string
          pergunta: string
          proximo_em: string | null
          restaurante_id: number
          ultimo_em: string | null
          ultimo_erro: string | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cada_dias: number
          criado_em?: string
          dia_do_mes?: number | null
          funcionarios?: number[]
          id?: never
          nome?: string
          pergunta: string
          proximo_em?: string | null
          restaurante_id: number
          ultimo_em?: string | null
          ultimo_erro?: string | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          cada_dias?: number
          criado_em?: string
          dia_do_mes?: number | null
          funcionarios?: number[]
          id?: never
          nome?: string
          pergunta?: string
          proximo_em?: string | null
          restaurante_id?: number
          ultimo_em?: string | null
          ultimo_erro?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "equipe_regras_pedido_restaurante_id_fkey"
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
          publico: string
          quantidade: number
          restaurante_id: number | null
          rotulo: string
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          created_at?: string
          id?: string
          publico?: string
          quantidade?: number
          restaurante_id?: number | null
          rotulo: string
          tipo?: string
        }
        Update: {
          atualizado_em?: string
          created_at?: string
          id?: string
          publico?: string
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
          publico: string
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
          publico?: string
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
          publico?: string
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
          publico: string
          restaurante_id: number | null
          resumo: string | null
          sentimento: string | null
          telefone_cliente: string | null
          tema_id: string | null
          texto_original: string | null
          triado_em: string | null
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
          publico?: string
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          tema_id?: string | null
          texto_original?: string | null
          triado_em?: string | null
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
          publico?: string
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          tema_id?: string | null
          texto_original?: string | null
          triado_em?: string | null
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
      google_avaliacoes: {
        Row: {
          anonimo: boolean
          atualizada_em: string | null
          autor: string | null
          buscada_em: string
          comentario: string | null
          criada_em: string
          id: string
          nota: number
          resposta: string | null
          resposta_em: string | null
          restaurante_id: number
        }
        Insert: {
          anonimo?: boolean
          atualizada_em?: string | null
          autor?: string | null
          buscada_em?: string
          comentario?: string | null
          criada_em: string
          id: string
          nota: number
          resposta?: string | null
          resposta_em?: string | null
          restaurante_id: number
        }
        Update: {
          anonimo?: boolean
          atualizada_em?: string | null
          autor?: string | null
          buscada_em?: string
          comentario?: string | null
          criada_em?: string
          id?: string
          nota?: number
          resposta?: string | null
          resposta_em?: string | null
          restaurante_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "google_avaliacoes_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      google_conexoes: {
        Row: {
          atualizado_em: string
          conectado_em: string
          conta: string | null
          endereco: string | null
          erro: string | null
          locais_disponiveis: Json | null
          local: string | null
          local_nome: string | null
          maps_uri: string | null
          nota_media: number | null
          place_id: string | null
          refresh_token_id: string | null
          restaurante_id: number
          status: string
          total_avaliacoes: number | null
          ultima_completa: string | null
          ultima_sincronizacao: string | null
          ultima_tentativa: string | null
        }
        Insert: {
          atualizado_em?: string
          conectado_em?: string
          conta?: string | null
          endereco?: string | null
          erro?: string | null
          locais_disponiveis?: Json | null
          local?: string | null
          local_nome?: string | null
          maps_uri?: string | null
          nota_media?: number | null
          place_id?: string | null
          refresh_token_id?: string | null
          restaurante_id: number
          status?: string
          total_avaliacoes?: number | null
          ultima_completa?: string | null
          ultima_sincronizacao?: string | null
          ultima_tentativa?: string | null
        }
        Update: {
          atualizado_em?: string
          conectado_em?: string
          conta?: string | null
          endereco?: string | null
          erro?: string | null
          locais_disponiveis?: Json | null
          local?: string | null
          local_nome?: string | null
          maps_uri?: string | null
          nota_media?: number | null
          place_id?: string | null
          refresh_token_id?: string | null
          restaurante_id?: number
          status?: string
          total_avaliacoes?: number | null
          ultima_completa?: string | null
          ultima_sincronizacao?: string | null
          ultima_tentativa?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "google_conexoes_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: true
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_estados: {
        Row: {
          criado_em: string
          restaurante_id: number
          state: string
        }
        Insert: {
          criado_em?: string
          restaurante_id: number
          state: string
        }
        Update: {
          criado_em?: string
          restaurante_id?: number
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_estados_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
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
      indicacao_config: {
        Row: {
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          beneficio: string
          id: boolean
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          beneficio?: string
          id?: boolean
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          beneficio?: string
          id?: boolean
        }
        Relationships: []
      }
      indicacao_premios: {
        Row: {
          aplicado_em: string | null
          aplicado_por: string | null
          beneficio: string
          criado_em: string
          id: string
          indicado_restaurante_id: number | null
          porcentagem: number | null
          restaurante_id: number
          status: string
        }
        Insert: {
          aplicado_em?: string | null
          aplicado_por?: string | null
          beneficio: string
          criado_em?: string
          id?: string
          indicado_restaurante_id?: number | null
          porcentagem?: number | null
          restaurante_id: number
          status?: string
        }
        Update: {
          aplicado_em?: string | null
          aplicado_por?: string | null
          beneficio?: string
          criado_em?: string
          id?: string
          indicado_restaurante_id?: number | null
          porcentagem?: number | null
          restaurante_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "indicacao_premios_indicado_restaurante_id_fkey"
            columns: ["indicado_restaurante_id"]
            isOneToOne: true
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacao_premios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      indicacoes: {
        Row: {
          afiliado_id: string
          codigo: string
          criado_em: string
          indicado_restaurante_id: number
          origem: string
          pagou_em: string | null
        }
        Insert: {
          afiliado_id: string
          codigo: string
          criado_em?: string
          indicado_restaurante_id: number
          origem?: string
          pagou_em?: string | null
        }
        Update: {
          afiliado_id?: string
          codigo?: string
          criado_em?: string
          indicado_restaurante_id?: number
          origem?: string
          pagou_em?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "indicacoes_afiliado_id_fkey"
            columns: ["afiliado_id"]
            isOneToOne: false
            referencedRelation: "afiliados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "indicacoes_indicado_restaurante_id_fkey"
            columns: ["indicado_restaurante_id"]
            isOneToOne: true
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      influencer_consultas: {
        Row: {
          criado_em: string
          id: number
          ip_hash: string
        }
        Insert: {
          criado_em?: string
          id?: number
          ip_hash: string
        }
        Update: {
          criado_em?: string
          id?: number
          ip_hash?: string
        }
        Relationships: []
      }
      influenciadores: {
        Row: {
          arroba: string | null
          auth_user_id: string | null
          cidade: string | null
          criado_em: string
          criado_por: string | null
          email: string
          id: string
          nome: string | null
          onboarding_em: string | null
          ultimo_acesso_em: string | null
          valor_mensal: number | null
        }
        Insert: {
          arroba?: string | null
          auth_user_id?: string | null
          cidade?: string | null
          criado_em?: string
          criado_por?: string | null
          email: string
          id?: string
          nome?: string | null
          onboarding_em?: string | null
          ultimo_acesso_em?: string | null
          valor_mensal?: number | null
        }
        Update: {
          arroba?: string | null
          auth_user_id?: string | null
          cidade?: string | null
          criado_em?: string
          criado_por?: string | null
          email?: string
          id?: string
          nome?: string | null
          onboarding_em?: string | null
          ultimo_acesso_em?: string | null
          valor_mensal?: number | null
        }
        Relationships: []
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
          publico: string
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
          publico?: string
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
          publico?: string
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
      mensagens_whatsapp: {
        Row: {
          atualizado_em: string
          chat_id: string
          criado_em: string
          de_mim: boolean
          editada_em: string | null
          enviada_em: string
          grupo: boolean
          id: number
          interativo: Json | null
          message_id: string
          midia_caminho: string | null
          midia_id: string | null
          midia_mime: string | null
          midia_nome: string | null
          midia_url: string | null
          nome_exibicao: string | null
          numero_restaurante: string | null
          oculta: boolean
          payload: Json | null
          por_api: boolean
          publico: string
          reacao: string | null
          responde_message_id: string | null
          restaurante_id: number
          status: string | null
          telefone: string | null
          texto: string | null
          tipo: string
          transcricao: string | null
        }
        Insert: {
          atualizado_em?: string
          chat_id: string
          criado_em?: string
          de_mim?: boolean
          editada_em?: string | null
          enviada_em: string
          grupo?: boolean
          id?: never
          interativo?: Json | null
          message_id: string
          midia_caminho?: string | null
          midia_id?: string | null
          midia_mime?: string | null
          midia_nome?: string | null
          midia_url?: string | null
          nome_exibicao?: string | null
          numero_restaurante?: string | null
          oculta?: boolean
          payload?: Json | null
          por_api?: boolean
          publico?: string
          reacao?: string | null
          responde_message_id?: string | null
          restaurante_id: number
          status?: string | null
          telefone?: string | null
          texto?: string | null
          tipo: string
          transcricao?: string | null
        }
        Update: {
          atualizado_em?: string
          chat_id?: string
          criado_em?: string
          de_mim?: boolean
          editada_em?: string | null
          enviada_em?: string
          grupo?: boolean
          id?: never
          interativo?: Json | null
          message_id?: string
          midia_caminho?: string | null
          midia_id?: string | null
          midia_mime?: string | null
          midia_nome?: string | null
          midia_url?: string | null
          nome_exibicao?: string | null
          numero_restaurante?: string | null
          oculta?: boolean
          payload?: Json | null
          por_api?: boolean
          publico?: string
          reacao?: string | null
          responde_message_id?: string | null
          restaurante_id?: number
          status?: string | null
          telefone?: string | null
          texto?: string | null
          tipo?: string
          transcricao?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_whatsapp_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      mensagens_whatsapp_leitura: {
        Row: {
          atualizado_em: string
          chat_id: string
          lido_ate: string
          restaurante_id: number
        }
        Insert: {
          atualizado_em?: string
          chat_id: string
          lido_ate: string
          restaurante_id: number
        }
        Update: {
          atualizado_em?: string
          chat_id?: string
          lido_ate?: string
          restaurante_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "mensagens_whatsapp_leitura_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
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
      metricas_diarias: {
        Row: {
          aberturas_qr: number
          acoes_concluidas: number
          acoes_criadas: number
          calculado_em: string
          clientes_novos: number
          dia: string
          insights_gerados: number
          mensagens: number
          negativos: number
          neutros: number
          por_categoria: Json
          positivos: number
          restaurante_id: number
          retornos: number
          sugestoes: number
        }
        Insert: {
          aberturas_qr?: number
          acoes_concluidas?: number
          acoes_criadas?: number
          calculado_em?: string
          clientes_novos?: number
          dia: string
          insights_gerados?: number
          mensagens?: number
          negativos?: number
          neutros?: number
          por_categoria?: Json
          positivos?: number
          restaurante_id: number
          retornos?: number
          sugestoes?: number
        }
        Update: {
          aberturas_qr?: number
          acoes_concluidas?: number
          acoes_criadas?: number
          calculado_em?: string
          clientes_novos?: number
          dia?: string
          insights_gerados?: number
          mensagens?: number
          negativos?: number
          neutros?: number
          por_categoria?: Json
          positivos?: number
          restaurante_id?: number
          retornos?: number
          sugestoes?: number
        }
        Relationships: [
          {
            foreignKeyName: "metricas_diarias_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
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
      planos_precos: {
        Row: {
          area: string
          ativo: boolean
          atualizado_em: string
          atualizado_por: string | null
          ciclo: string
          parcelas_max: number | null
          total_centavos: number
          total_parcelado_centavos: number | null
        }
        Insert: {
          area: string
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          ciclo: string
          parcelas_max?: number | null
          total_centavos: number
          total_parcelado_centavos?: number | null
        }
        Update: {
          area?: string
          ativo?: boolean
          atualizado_em?: string
          atualizado_por?: string | null
          ciclo?: string
          parcelas_max?: number | null
          total_centavos?: number
          total_parcelado_centavos?: number | null
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
      preferencias_conversa: {
        Row: {
          atualizado_em: string
          auth_user_id: string
          canal: string
          conversa: string
          fixada_em: string | null
          silenciada: boolean
        }
        Insert: {
          atualizado_em?: string
          auth_user_id?: string
          canal: string
          conversa?: string
          fixada_em?: string | null
          silenciada?: boolean
        }
        Update: {
          atualizado_em?: string
          auth_user_id?: string
          canal?: string
          conversa?: string
          fixada_em?: string | null
          silenciada?: boolean
        }
        Relationships: []
      }
      previas_link: {
        Row: {
          buscado_em: string
          descricao: string | null
          imagem: string | null
          ok: boolean
          site: string | null
          titulo: string | null
          url: string
          url_final: string | null
        }
        Insert: {
          buscado_em?: string
          descricao?: string | null
          imagem?: string | null
          ok: boolean
          site?: string | null
          titulo?: string | null
          url: string
          url_final?: string | null
        }
        Update: {
          buscado_em?: string
          descricao?: string | null
          imagem?: string | null
          ok?: boolean
          site?: string | null
          titulo?: string | null
          url?: string
          url_final?: string | null
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
          aparelho: string | null
          auth: string
          auth_user_id: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          aparelho?: string | null
          auth: string
          auth_user_id: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          aparelho?: string | null
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
      recebedores: {
        Row: {
          agencia: string | null
          atualizado_em: string
          banco: string | null
          chave_pix: string | null
          codigo_banco: string | null
          conta: string | null
          cpf_cnpj: string | null
          criado_em: string
          email: string | null
          id: string
          nome: string
          observacoes: string | null
          tipo_conta: string | null
        }
        Insert: {
          agencia?: string | null
          atualizado_em?: string
          banco?: string | null
          chave_pix?: string | null
          codigo_banco?: string | null
          conta?: string | null
          cpf_cnpj?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          nome: string
          observacoes?: string | null
          tipo_conta?: string | null
        }
        Update: {
          agencia?: string | null
          atualizado_em?: string
          banco?: string | null
          chave_pix?: string | null
          codigo_banco?: string | null
          conta?: string | null
          cpf_cnpj?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          nome?: string
          observacoes?: string | null
          tipo_conta?: string | null
        }
        Relationships: []
      }
      recuperacoes_senha: {
        Row: {
          criado_em: string
          email: string
          id: number
          ip_hash: string
        }
        Insert: {
          criado_em?: string
          email: string
          id?: number
          ip_hash: string
        }
        Update: {
          criado_em?: string
          email?: string
          id?: number
          ip_hash?: string
        }
        Relationships: []
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
          area: string | null
          assinatura_cancelada_em: string | null
          assinatura_expira_em: string | null
          assinatura_origem: string | null
          assinatura_status: string
          auth_user_id: string
          cliente_bg_imagem: string | null
          cliente_bg_modo: string | null
          cliente_configurado_em: string | null
          cliente_elementos: Json
          cliente_estilo: string | null
          cliente_textos: Json
          cliente_textos_estilo: Json
          config_bonificacao: Json
          config_insights: Json | null
          created_at: string
          credito_ia_ciclo_inicio: string
          credito_ia_limite_usd: number
          detalhes: string | null
          email: string | null
          excluida_em: string | null
          feedbacks_visto_em: string
          frequencia_relatorios: string | null
          funcoes_config: Json | null
          ia_modo_acao: string
          id: number
          logo_url: string | null
          mascote_config: Json | null
          metodo_coleta_feedback: string | null
          nome_restaurante: string | null
          numero_funcionarios: number | null
          numero_mesas: number | null
          numero_whatsapp: string | null
          onboarding_completo: boolean
          perfil_restaurante: Json
          plano_ciclo: string | null
          qr_bg_imagem: string | null
          qr_bg_modo: string | null
          qr_elementos: Json
          qr_estilo: string | null
          qr_filtro: string | null
          qr_mensagem: string | null
          qr_rotulo: string | null
          qr_textos_estilo: Json | null
          qr_titulo: string | null
          ramo: string | null
          telefone_contato: string | null
          texto_banner: string | null
          tipo_culinaria: string | null
          ultima_analise_insights: string | null
          ultima_analise_insights_equipe: string | null
          ultima_atualizacao_banner: string | null
          whatsapp_admin_token: string | null
          whatsapp_base_url: string | null
          whatsapp_conectado: boolean
          whatsapp_dono: string | null
          whatsapp_status_em: string | null
          whatsapp_token: string | null
        }
        Insert: {
          area?: string | null
          assinatura_cancelada_em?: string | null
          assinatura_expira_em?: string | null
          assinatura_origem?: string | null
          assinatura_status?: string
          auth_user_id: string
          cliente_bg_imagem?: string | null
          cliente_bg_modo?: string | null
          cliente_configurado_em?: string | null
          cliente_elementos?: Json
          cliente_estilo?: string | null
          cliente_textos?: Json
          cliente_textos_estilo?: Json
          config_bonificacao?: Json
          config_insights?: Json | null
          created_at?: string
          credito_ia_ciclo_inicio?: string
          credito_ia_limite_usd?: number
          detalhes?: string | null
          email?: string | null
          excluida_em?: string | null
          feedbacks_visto_em?: string
          frequencia_relatorios?: string | null
          funcoes_config?: Json | null
          ia_modo_acao?: string
          id?: number
          logo_url?: string | null
          mascote_config?: Json | null
          metodo_coleta_feedback?: string | null
          nome_restaurante?: string | null
          numero_funcionarios?: number | null
          numero_mesas?: number | null
          numero_whatsapp?: string | null
          onboarding_completo?: boolean
          perfil_restaurante?: Json
          plano_ciclo?: string | null
          qr_bg_imagem?: string | null
          qr_bg_modo?: string | null
          qr_elementos?: Json
          qr_estilo?: string | null
          qr_filtro?: string | null
          qr_mensagem?: string | null
          qr_rotulo?: string | null
          qr_textos_estilo?: Json | null
          qr_titulo?: string | null
          ramo?: string | null
          telefone_contato?: string | null
          texto_banner?: string | null
          tipo_culinaria?: string | null
          ultima_analise_insights?: string | null
          ultima_analise_insights_equipe?: string | null
          ultima_atualizacao_banner?: string | null
          whatsapp_admin_token?: string | null
          whatsapp_base_url?: string | null
          whatsapp_conectado?: boolean
          whatsapp_dono?: string | null
          whatsapp_status_em?: string | null
          whatsapp_token?: string | null
        }
        Update: {
          area?: string | null
          assinatura_cancelada_em?: string | null
          assinatura_expira_em?: string | null
          assinatura_origem?: string | null
          assinatura_status?: string
          auth_user_id?: string
          cliente_bg_imagem?: string | null
          cliente_bg_modo?: string | null
          cliente_configurado_em?: string | null
          cliente_elementos?: Json
          cliente_estilo?: string | null
          cliente_textos?: Json
          cliente_textos_estilo?: Json
          config_bonificacao?: Json
          config_insights?: Json | null
          created_at?: string
          credito_ia_ciclo_inicio?: string
          credito_ia_limite_usd?: number
          detalhes?: string | null
          email?: string | null
          excluida_em?: string | null
          feedbacks_visto_em?: string
          frequencia_relatorios?: string | null
          funcoes_config?: Json | null
          ia_modo_acao?: string
          id?: number
          logo_url?: string | null
          mascote_config?: Json | null
          metodo_coleta_feedback?: string | null
          nome_restaurante?: string | null
          numero_funcionarios?: number | null
          numero_mesas?: number | null
          numero_whatsapp?: string | null
          onboarding_completo?: boolean
          perfil_restaurante?: Json
          plano_ciclo?: string | null
          qr_bg_imagem?: string | null
          qr_bg_modo?: string | null
          qr_elementos?: Json
          qr_estilo?: string | null
          qr_filtro?: string | null
          qr_mensagem?: string | null
          qr_rotulo?: string | null
          qr_textos_estilo?: Json | null
          qr_titulo?: string | null
          ramo?: string | null
          telefone_contato?: string | null
          texto_banner?: string | null
          tipo_culinaria?: string | null
          ultima_analise_insights?: string | null
          ultima_analise_insights_equipe?: string | null
          ultima_atualizacao_banner?: string | null
          whatsapp_admin_token?: string | null
          whatsapp_base_url?: string | null
          whatsapp_conectado?: boolean
          whatsapp_dono?: string | null
          whatsapp_status_em?: string | null
          whatsapp_token?: string | null
        }
        Relationships: []
      }
      salvy_sms: {
        Row: {
          codigo_whatsapp: string | null
          created_at: string
          deteccoes: Json
          id: string
          linha_id: string
          mensagem: string
          numero: string
          origem: string
          recebido_em: string
        }
        Insert: {
          codigo_whatsapp?: string | null
          created_at?: string
          deteccoes?: Json
          id: string
          linha_id: string
          mensagem?: string
          numero: string
          origem?: string
          recebido_em: string
        }
        Update: {
          codigo_whatsapp?: string | null
          created_at?: string
          deteccoes?: Json
          id?: string
          linha_id?: string
          mensagem?: string
          numero?: string
          origem?: string
          recebido_em?: string
        }
        Relationships: []
      }
      sessoes_demo: {
        Row: {
          auth_user_id: string
          criado_em: string
          duracao_minutos: number
          email_vendedor: string
          encerrada_em: string | null
          expira_em: string | null
          id: string
          iniciada_em: string | null
          janela: number
          restaurante_id: number
          session_id: string | null
        }
        Insert: {
          auth_user_id: string
          criado_em?: string
          duracao_minutos: number
          email_vendedor: string
          encerrada_em?: string | null
          expira_em?: string | null
          id?: string
          iniciada_em?: string | null
          janela: number
          restaurante_id: number
          session_id?: string | null
        }
        Update: {
          auth_user_id?: string
          criado_em?: string
          duracao_minutos?: number
          email_vendedor?: string
          encerrada_em?: string | null
          expira_em?: string | null
          id?: string
          iniciada_em?: string | null
          janela?: number
          restaurante_id?: number
          session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_demo_email_vendedor_fkey"
            columns: ["email_vendedor"]
            isOneToOne: false
            referencedRelation: "vendedores"
            referencedColumns: ["email"]
          },
          {
            foreignKeyName: "sessoes_demo_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      silencios_aparelho: {
        Row: {
          aparelho: string
          auth_user_id: string
          canal: string
          conversa: string
          criado_em: string
        }
        Insert: {
          aparelho: string
          auth_user_id?: string
          canal: string
          conversa?: string
          criado_em?: string
        }
        Update: {
          aparelho?: string
          auth_user_id?: string
          canal?: string
          conversa?: string
          criado_em?: string
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
      textos_autorizacao_marketing: {
        Row: {
          criado_em: string
          texto: string
          versao: string
        }
        Insert: {
          criado_em?: string
          texto: string
          versao: string
        }
        Update: {
          criado_em?: string
          texto?: string
          versao?: string
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
      vendedores: {
        Row: {
          criado_em: string
          criado_por: string | null
          email: string
          segredo_demo: string
        }
        Insert: {
          criado_em?: string
          criado_por?: string | null
          email: string
          segredo_demo?: string
        }
        Update: {
          criado_em?: string
          criado_por?: string | null
          email?: string
          segredo_demo?: string
        }
        Relationships: []
      }
      video_config: {
        Row: {
          area: string
          atualizado_em: string
          id: boolean
          max_por_ano: number | null
        }
        Insert: {
          area?: string
          atualizado_em?: string
          id?: boolean
          max_por_ano?: number | null
        }
        Update: {
          area?: string
          atualizado_em?: string
          id?: boolean
          max_por_ano?: number | null
        }
        Relationships: []
      }
      video_envios: {
        Row: {
          analisado_em: string | null
          analise: Json | null
          aprovado_em: string | null
          atualizado_em: string
          autorizou_uso: boolean
          caminho: string
          criado_em: string
          duracao_segundos: number | null
          id: string
          mime: string
          missao_id: number
          motivo: string | null
          nome_arquivo: string
          restaurante_id: number
          revisado_em: string | null
          revisado_por: string | null
          status: string
          tamanho_bytes: number
        }
        Insert: {
          analisado_em?: string | null
          analise?: Json | null
          aprovado_em?: string | null
          atualizado_em?: string
          autorizou_uso: boolean
          caminho: string
          criado_em?: string
          duracao_segundos?: number | null
          id?: string
          mime: string
          missao_id: number
          motivo?: string | null
          nome_arquivo?: string
          restaurante_id: number
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          tamanho_bytes: number
        }
        Update: {
          analisado_em?: string | null
          analise?: Json | null
          aprovado_em?: string | null
          atualizado_em?: string
          autorizou_uso?: boolean
          caminho?: string
          criado_em?: string
          duracao_segundos?: number | null
          id?: string
          mime?: string
          missao_id?: number
          motivo?: string | null
          nome_arquivo?: string
          restaurante_id?: number
          revisado_em?: string | null
          revisado_por?: string | null
          status?: string
          tamanho_bytes?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_envios_missao_id_fkey"
            columns: ["missao_id"]
            isOneToOne: false
            referencedRelation: "video_missoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_envios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      video_missoes: {
        Row: {
          area: string
          ativa: boolean
          atualizado_em: string
          criado_em: string
          descricao: string
          disponivel_ate: string | null
          disponivel_de: string | null
          duracao_max_s: number
          duracao_min_s: number
          id: number
          ordem: number
          requisitos: Json
          titulo: string
        }
        Insert: {
          area?: string
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string
          disponivel_ate?: string | null
          disponivel_de?: string | null
          duracao_max_s: number
          duracao_min_s: number
          id?: never
          ordem?: number
          requisitos?: Json
          titulo: string
        }
        Update: {
          area?: string
          ativa?: boolean
          atualizado_em?: string
          criado_em?: string
          descricao?: string
          disponivel_ate?: string | null
          disponivel_de?: string | null
          duracao_max_s?: number
          duracao_min_s?: number
          id?: never
          ordem?: number
          requisitos?: Json
          titulo?: string
        }
        Relationships: []
      }
      video_premios: {
        Row: {
          ano: number
          aplicado_em: string | null
          aplicado_por: string | null
          criado_em: string
          descricao: string
          envio_id: string
          id: string
          recompensa_ordem: number
          restaurante_id: number
          status: string
        }
        Insert: {
          ano: number
          aplicado_em?: string | null
          aplicado_por?: string | null
          criado_em?: string
          descricao: string
          envio_id: string
          id?: string
          recompensa_ordem: number
          restaurante_id: number
          status?: string
        }
        Update: {
          ano?: number
          aplicado_em?: string | null
          aplicado_por?: string | null
          criado_em?: string
          descricao?: string
          envio_id?: string
          id?: string
          recompensa_ordem?: number
          restaurante_id?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_premios_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: true
            referencedRelation: "video_envios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_premios_restaurante_id_fkey"
            columns: ["restaurante_id"]
            isOneToOne: false
            referencedRelation: "restaurantes"
            referencedColumns: ["id"]
          },
        ]
      }
      video_recompensas: {
        Row: {
          area: string
          atualizado_em: string
          descricao: string
          ordem: number
        }
        Insert: {
          area?: string
          atualizado_em?: string
          descricao: string
          ordem: number
        }
        Update: {
          area?: string
          atualizado_em?: string
          descricao?: string
          ordem?: number
        }
        Relationships: []
      }
      whatsapp_fotos: {
        Row: {
          atualizada_em: string
          foto_url: string | null
          restaurante_id: number
          telefone: string
        }
        Insert: {
          atualizada_em?: string
          foto_url?: string | null
          restaurante_id: number
          telefone: string
        }
        Update: {
          atualizada_em?: string
          foto_url?: string | null
          restaurante_id?: number
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_fotos_restaurante_id_fkey"
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
          publico: string | null
          restaurante_id: number | null
          resumo: string | null
          sentimento: string | null
          telefone_cliente: string | null
          tema_id: string | null
          texto_original: string | null
          triado_em: string | null
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
          publico?: string | null
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          tema_id?: string | null
          texto_original?: string | null
          triado_em?: string | null
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
          publico?: string | null
          restaurante_id?: number | null
          resumo?: string | null
          sentimento?: string | null
          telefone_cliente?: string | null
          tema_id?: string | null
          texto_original?: string | null
          triado_em?: string | null
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
          autoria: Json | null
          categorias: string[] | null
          created_at: string | null
          id: string | null
          publico: string | null
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
          concluida_em: string | null
          contato_id: string | null
          etapa: Database["public"]["Enums"]["aviso_etapa"] | null
          feedback_em: string | null
          feedback_original_id: string | null
          feedback_restaurante_id: number | null
          nome_restaurante: string | null
          plano_detalhado: string | null
          prioridade: string | null
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
      aba_do_insight: { Args: { p_prioridade: string }; Returns: string }
      acesso_admin_atual: {
        Args: never
        Returns: {
          admin_email: string
          iniciado_em: string
          restaurante_id: number
        }[]
      }
      admin_area_config: { Args: never; Returns: Json }
      admin_area_salvar: {
        Args: { p_modo: string; p_novo_convite?: boolean }
        Returns: Json
      }
      admin_definir_area: {
        Args: { p_area: string; p_restaurante_id: number }
        Returns: Json
      }
      admin_definir_vendedor: {
        Args: { p_email: string; p_vendedor: boolean }
        Returns: undefined
      }
      admin_listar_vendedores: {
        Args: never
        Returns: {
          criado_em: string
          email: string
          nome_restaurante: string
          restaurante_id: number
          tem_conta: boolean
          ultima_demo_em: string
        }[]
      }
      admin_metricas_atualizar: {
        Args: { p_restaurante_id?: number }
        Returns: number
      }
      admin_push_subscriptions: {
        Args: { p_cliente?: string }
        Returns: {
          aparelho: string
          auth: string
          auth_user_id: string
          endpoint: string
          p256dh: string
        }[]
      }
      admin_resultados_restaurantes: {
        Args: never
        Returns: {
          area: string
          assinatura_status: string
          created_at: string
          eh_teste: boolean
          excluida_em: string
          id: number
          logo_url: string
          nome: string
          tipo_culinaria: string
        }[]
      }
      afiliados_numeros: { Args: { p_area: string }; Returns: Json }
      area_da_conta: { Args: { p_restaurante_id: number }; Returns: string }
      area_da_conta_logada: { Args: never; Returns: string }
      area_eh_admin: { Args: never; Returns: boolean }
      area_opcoes: { Args: { p_convite?: string }; Returns: Json }
      area_rh_permitida: { Args: { p_convite: string }; Returns: boolean }
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
      categorias_da_conta: {
        Args: { p_publico?: string; p_restaurante_id: number }
        Returns: Json
      }
      categorias_padrao: { Args: { p_publico: string }; Returns: Json }
      categorias_pode_ver: {
        Args: { p_restaurante_id: number }
        Returns: boolean
      }
      cobranca_aplicar: { Args: { p_restaurante_id: number }; Returns: string }
      cobranca_vigente: { Args: { p_restaurante_id: number }; Returns: boolean }
      codigo_demo: {
        Args: { p_janela: number; p_segredo: string }
        Returns: string
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
      conta_usa_as_duas_versoes: {
        Args: { p_restaurante_id: number }
        Returns: boolean
      }
      contato_contexto_parar: {
        Args: { p_restaurante_id: number; p_telefone: string }
        Returns: Json
      }
      contato_parar_atualizacoes: {
        Args: {
          p_motivo?: string
          p_restaurante_id: number
          p_telefone: string
        }
        Returns: {
          marcou: boolean
        }[]
      }
      conversas_whatsapp: {
        Args: { p_restaurante_id: number }
        Returns: {
          chat_id: string
          fixada_em: string
          foto_url: string
          grupo: boolean
          nao_lidas: number
          nome_exibicao: string
          silenciada: boolean
          telefone: string
          ultima_de_mim: boolean
          ultima_enviada_em: string
          ultima_message_id: string
          ultima_midia_nome: string
          ultima_por_api: boolean
          ultima_reacao: string
          ultima_remetente: string
          ultima_status: string
          ultima_texto: string
          ultima_tipo: string
        }[]
      }
      definir_minha_autorizacao_marketing: {
        Args: {
          p_autorizar: boolean
          p_pode_depoimento: boolean
          p_pode_logo: boolean
          p_pode_nome: boolean
          p_pode_numeros: boolean
          p_versao: string
        }
        Returns: undefined
      }
      deve_gerar_insights: {
        Args: { p_publico?: string; p_restaurante_id: number }
        Returns: {
          deve: boolean
          livres_novos: number
          necessarios: number
        }[]
      }
      difere_por_troca: { Args: { a: string; b: string }; Returns: boolean }
      eh_admin_parceiro: { Args: never; Returns: boolean }
      eh_admin_plataforma_ou_console: { Args: never; Returns: boolean }
      eh_influencer: { Args: never; Returns: boolean }
      encerrar_acesso_admin: { Args: never; Returns: boolean }
      encerrar_sessoes_demo: { Args: never; Returns: number }
      equipe_autoria_visivel: { Args: { p_original_id: string }; Returns: Json }
      equipe_contexto_parar: {
        Args: { p_restaurante_id: number; p_telefone: string }
        Returns: Json
      }
      equipe_convites_anonimos: {
        Args: never
        Returns: {
          envio_id: number
          respondeu: boolean
          status: string
        }[]
      }
      equipe_escolher_identidade: {
        Args: {
          p_escolha: string
          p_restaurante_id: number
          p_telefone: string
        }
        Returns: Json
      }
      equipe_identidade_perguntada: {
        Args: { p_restaurante_id: number; p_telefone: string }
        Returns: Json
      }
      equipe_liberada: { Args: never; Returns: boolean }
      equipe_parar: {
        Args: {
          p_motivo?: string
          p_restaurante_id: number
          p_telefone: string
        }
        Returns: {
          marcou: boolean
        }[]
      }
      equipe_pegar_convite: {
        Args: never
        Returns: {
          criado_em: string
          enviado_em: string | null
          envio_id: number
          erro: string | null
          funcionario_id: number | null
          id: number
          message_id: string | null
          respondeu_em: string | null
          restaurante_id: number
          status: string
          telefone: string
          tentou_em: string | null
          texto: string
        }[]
        SetofOptions: {
          from: "*"
          to: "equipe_convites"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      equipe_prazo_identidade: { Args: never; Returns: string }
      equipe_quem_e: {
        Args: { p_restaurante_id: number; p_telefone: string }
        Returns: Json
      }
      equipe_registrar_feedback: {
        Args: {
          p_pontos: Json
          p_restaurante_id: number
          p_sensivel?: boolean
          p_sentimento: string
          p_telefone: string
          p_texto: string
        }
        Returns: Json
      }
      equipe_relatorio_participacao: {
        Args: { p_desde: string }
        Returns: Json
      }
      equipe_revelar_mensagens: {
        Args: { p_restaurante_id?: number; p_telefone?: string }
        Returns: number
      }
      equipe_vencer_identidades: { Args: never; Returns: number }
      escolher_area: {
        Args: { p_area: string; p_convite?: string }
        Returns: Json
      }
      expirar_assinaturas: { Args: never; Returns: number }
      feedbacks_para_geracao: {
        Args: { p_dias?: number; p_publico?: string; p_restaurante_id: number }
        Returns: {
          categoria: string | null
          contato_id: string | null
          created_at: string
          id: number
          invalidado_em: string | null
          origem_id: string | null
          publico: string
          restaurante_id: number | null
          resumo: string | null
          sentimento: string | null
          telefone_cliente: string | null
          tema_id: string | null
          texto_original: string | null
          triado_em: string | null
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
      fila_retorno_por_cliente: {
        Args: { p_restaurante_id?: number }
        Returns: {
          acoes: Json
          aviso_ids: string[]
          contato_id: string
          mensagem_sugerida: string
          nome_restaurante: string
          restaurante_id: number
          telefone: string
          ultimo_envio_em: string
          whatsapp_base_url: string
          whatsapp_token: string
        }[]
      }
      fixadas_whatsapp_do_restaurante: {
        Args: { p_restaurante_id: number }
        Returns: {
          conversa: string
          fixada_em: string
        }[]
      }
      get_user_restaurante_id: { Args: never; Returns: number }
      google_apagar_token: {
        Args: { p_restaurante_id: number }
        Returns: undefined
      }
      google_guardar_token: {
        Args: { p_restaurante_id: number; p_token: string }
        Returns: undefined
      }
      google_ler_token: { Args: { p_restaurante_id: number }; Returns: string }
      google_medias_mensais: {
        Args: { p_meses?: number }
        Returns: {
          media: number
          media_acumulada: number
          mes: string
          quantidade: number
        }[]
      }
      google_resumo: {
        Args: never
        Returns: {
          estrelas_1: number
          estrelas_2: number
          estrelas_3: number
          estrelas_4: number
          estrelas_5: number
          media_30d: number
          quantidade_30d: number
        }[]
      }
      indicacao_admin: { Args: never; Returns: Json }
      indicacao_admin_premio: {
        Args: { p_id: string; p_status: string }
        Returns: Json
      }
      indicacao_admin_salvar: {
        Args: { p_ativo: boolean; p_beneficio: string }
        Returns: Json
      }
      indicacao_codigo_novo: { Args: { p_nome: string }; Returns: string }
      indicacao_eh_admin: { Args: never; Returns: boolean }
      indicacao_ja_pagou: {
        Args: { p_restaurante_id: number }
        Returns: boolean
      }
      indicacao_liberada: { Args: never; Returns: boolean }
      indicacao_meses_pagos: {
        Args: { p_restaurante_id: number }
        Returns: number
      }
      indicacao_minha: { Args: never; Returns: Json }
      indicacao_registrar: { Args: { p_codigo: string }; Returns: Json }
      indicacao_registrar_pagamento: {
        Args: { p_restaurante_id: number }
        Returns: string
      }
      influencer_conta: {
        Args: { p_email: string }
        Returns: {
          tem_senha: boolean
          user_id: string
        }[]
      }
      influencer_marcar_acesso: { Args: never; Returns: undefined }
      influencer_salvar_perfil: {
        Args: { p_arroba: string; p_cidade: string; p_nome: string }
        Returns: boolean
      }
      influencers_definir_incluir_testes: {
        Args: { p_incluir: boolean }
        Returns: boolean
      }
      influencers_incluem_testes: { Args: never; Returns: boolean }
      influencers_painel: {
        Args: { p_culinaria?: string; p_dias?: number }
        Returns: Json
      }
      influencers_restaurantes_base: {
        Args: { p_testes: boolean }
        Returns: {
          id: number
          tipo_culinaria: string
        }[]
      }
      influencers_sem_acento: { Args: { p: string }; Returns: string }
      influencers_tipo: { Args: { p_sentimento: string }; Returns: string }
      janela_demo_atual: { Args: never; Returns: number }
      jsonb_de_texto: { Args: { p_texto: string }; Returns: Json }
      limpar_contas_abandonadas: { Args: never; Returns: number }
      metricas_atualizar: {
        Args: { p_dias?: number; p_restaurante_id?: number }
        Returns: number
      }
      metricas_calcular: {
        Args: { p_ate: string; p_desde: string; p_restaurante_id: number }
        Returns: number
      }
      meu_acesso: {
        Args: never
        Returns: {
          demo_duracao_minutos: number
          demo_expira_em: string
          eh_vendedor: boolean
          em_demonstracao: boolean
        }[]
      }
      meu_codigo_demo: {
        Args: never
        Returns: {
          codigo: string
          segundos_restantes: number
        }[]
      }
      meu_uso_ia: {
        Args: never
        Returns: {
          ciclo_inicio: string
          gasto: number
          limite: number
        }[]
      }
      minha_autorizacao_marketing: {
        Args: never
        Returns: {
          autorizado_em: string
          autorizado_por: string
          eh_dono: boolean
          origem: string
          pode_depoimento: boolean
          pode_logo: boolean
          pode_nome: boolean
          pode_numeros: boolean
          revogado_em: string
          status: string
          texto_atual: string
          versao_aceita: string
          versao_atual: string
        }[]
      }
      minhas_categorias: { Args: never; Returns: Json }
      motor_cabecalhos: { Args: never; Returns: Json }
      normalizar_busca: { Args: { t: string }; Returns: string }
      normalizar_telefone: { Args: { p: string }; Returns: string }
      ordem_status_acao:
        | {
            Args: { p_etapa: Database["public"]["Enums"]["aviso_etapa"] }
            Returns: number
          }
        | { Args: { p_status: string }; Returns: number }
      parceiro_contas: {
        Args: never
        Returns: {
          area: string
          assinatura_status: string
          auth_user_id: string
          avatar_url: string
          created_at: string
          detalhes: string
          email: string
          id: number
          logo_url: string
          nome: string
          nome_restaurante: string
          numero_mesas: number
          numero_whatsapp: string
          onboarding_completo: boolean
          plano_ciclo: string
          tem_instancia: boolean
          tipo_culinaria: string
          whatsapp_conectado: boolean
          whatsapp_dono: string
        }[]
      }
      parceiro_pode_ver: {
        Args: { p_email: string; p_restaurante_id: number }
        Returns: boolean
      }
      parceiro_ve_arquivo_suporte: {
        Args: { p_nome: string }
        Returns: boolean
      }
      parceiro_ve_conta: {
        Args: { p_restaurante_id: number }
        Returns: boolean
      }
      parceiro_ve_midia_whatsapp: { Args: { p_nome: string }; Returns: boolean }
      parceiro_ve_sugestao: { Args: { p_sugestao: string }; Returns: boolean }
      parceiro_ve_usuario: { Args: { p_usuario: string }; Returns: boolean }
      pesquisar_mensagens_whatsapp: {
        Args: {
          p_chat_id?: string
          p_limite?: number
          p_restaurante_id: number
          p_termo: string
        }
        Returns: {
          chat_id: string
          de_mim: boolean
          editada_em: string
          enviada_em: string
          grupo: boolean
          id: number
          message_id: string
          midia_caminho: string
          midia_mime: string
          midia_nome: string
          nome_exibicao: string
          por_api: boolean
          reacao: string
          relevancia: number
          remetente: string
          responde_message_id: string
          semelhanca: number
          status: string
          telefone: string
          texto: string
          tipo: string
          transcricao: string
        }[]
      }
      promover_transicoes_pendentes: {
        Args: never
        Returns: {
          avisos_criados: number
          canceladas: number
          promovidas: number
        }[]
      }
      publico_da_requisicao: { Args: never; Returns: string }
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
      registrar_push: {
        Args: {
          p_aparelho: string
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent: string
        }
        Returns: undefined
      }
      registrar_sessao_demo: {
        Args: { p_sessao_demo_id: string }
        Returns: {
          duracao_minutos: number
          expira_em: string
        }[]
      }
      restaurar_categorias: { Args: { p_publico: string }; Returns: Json }
      retriar_feedbacks_pendentes: { Args: never; Returns: undefined }
      salvar_categorias: {
        Args: { p_itens: Json; p_publico: string }
        Returns: Json
      }
      sessao_eh_demo: { Args: never; Returns: boolean }
      telefone_chave: { Args: { valor: string }; Returns: string }
      temas_agrupados: {
        Args: { p_desde?: string; p_restaurante_id: number; p_tipo?: string }
        Returns: {
          id: string
          quantidade: number
          rotulo: string
          tipo: string
        }[]
      }
      validar_codigo_demo: {
        Args: { p_codigo: string; p_ip: string }
        Returns: {
          duracao_minutos: number
          email: string
          resultado: string
          sessao_demo_id: string
        }[]
      }
      whatsapp_interativo: { Args: { p_payload: Json }; Returns: Json }
      whatsapp_numero_da_conta: {
        Args: { p_restaurante_id: number }
        Returns: string
      }
      whatsapp_publico_da_conta: {
        Args: { p_restaurante_id: number }
        Returns: string
      }
      whatsapp_texto_do_interativo: {
        Args: { p_interativo: Json }
        Returns: string
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
