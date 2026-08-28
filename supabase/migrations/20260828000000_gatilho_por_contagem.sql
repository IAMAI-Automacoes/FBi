-- O disparo da analise passa a ser por CONTAGEM de feedbacks livres.
--
-- ## O que estava errado
--
-- A tela de Insights tem um slider e diz ao dono, com estas palavras: "A
-- analise automatica sera disparada a cada N novos feedbacks". O valor e salvo
-- em `config_insights.feedbacks_por_analise` desde sempre.
--
-- Nenhuma edge function lia essa chave. O disparo real era por TEMPO
-- (`horas_entre_analises`, 24h, mais um cron de hora em hora). O slider nao
-- fazia absolutamente nada — mexer nele mudava um numero no banco e mais nada.
--
-- ## Por que contar so os LIVRES
--
-- Um feedback que chega e gruda numa acao ja existente nao tem o que ser
-- analisado: ele ja esta sendo tratado. Contar todo feedback novo dispararia
-- rodadas caras que nao teriam material.
--
-- E o momento de contar importa: o feedback nasce livre, o `vincular-feedback`
-- roda logo depois e pode gruda-lo em algo. So depois disso se sabe se ele
-- conta. Por isso quem consulta esta funcao e o proprio `vincular-feedback`,
-- ao terminar decidindo "livre".
--
-- ## O marco
--
-- `restaurantes.ultima_analise_insights` ja existia e ja era atualizado a cada
-- rodada. Ele vira a linha de corte: contam os livres criados DEPOIS dele.
--
-- Como a rodada atualiza o marco mesmo quando nao gera nada, o comportamento
-- pedido sai de graca: "se tinha 5 e nao gerou nenhum insight, espera chegar
-- mais 5".
--
-- Efeito colateral aceito: pontos que voltam ao pool porque um insight foi
-- excluido tem `created_at` antigo e nao contam para DISPARAR. Eles continuam
-- entrando normalmente na proxima rodada, via `feedbacks_para_geracao` — so nao
-- provocam uma.

create or replace function public.deve_gerar_insights(p_restaurante_id bigint)
returns table(deve boolean, livres_novos bigint, necessarios integer)
language sql
stable
security definer
set search_path to 'public'
as $$
  with cfg as (
    select
      -- O mesmo teto do slider (src/pages/Insights.tsx): 3 a 30.
      least(greatest(
        coalesce((r.config_insights ->> 'feedbacks_por_analise')::int, 5),
      3), 30) as necessarios,
      coalesce(r.ultima_analise_insights, '-infinity'::timestamptz) as marco
    from public.restaurantes r
    where r.id = p_restaurante_id
      and r.excluida_em is null
  ),
  contagem as (
    select count(*) as livres
    from public.feedbacks_livres f, cfg
    where f.restaurante_id = p_restaurante_id
      and f.created_at > cfg.marco
  )
  select contagem.livres >= cfg.necessarios, contagem.livres, cfg.necessarios
  from cfg, contagem;
$$;

comment on function public.deve_gerar_insights(bigint) is
  'Ja ha feedbacks livres suficientes para uma rodada de insights? Conta so os criados apos ultima_analise_insights.';
