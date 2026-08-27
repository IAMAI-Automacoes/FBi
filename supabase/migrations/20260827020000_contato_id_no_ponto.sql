-- `contato_id` direto no feedback separado.
--
-- ## O problema
--
-- O dono da mensagem só existia em `feedbacks_originais`. Todo código que
-- precisava saber "de quem é este ponto?" tinha que subir um nível:
--
--     feedbacks_restaurante.origem_id -> feedbacks_originais.contato_id
--
-- Isso aparece em toda parte do motor de resposta. `promover_transicoes_pendentes`
-- faz esse join para criar os avisos; o worker faz de novo, com um join aninhado
-- do PostgREST (`feedback_acao -> feedbacks_originais!inner`), só para descobrir
-- quais feedbacks são do contato que está recebendo a mensagem.
--
-- E o ponto separado é a unidade de trabalho de todo o resto do sistema — o
-- vínculo com o insight é por ponto, o vínculo com a ação é por ponto, o aviso é
-- por ponto. Só o dono não era.
--
-- ## O preenchimento é por trigger, não por quem insere
--
-- Quem grava em `feedbacks_restaurante` é o n8n, e ele não conhece esta coluna.
-- Um BEFORE INSERT que deriva do original quando o valor vem nulo mantém a
-- coluna correta sem depender de mudança lá fora — e continua valendo se um dia
-- alguém inserir por SQL, por script de importação ou pelo painel.
--
-- O trigger nunca sobrescreve um valor explícito: quem já souber o contato pode
-- passá-lo direto.
--
-- ## ON DELETE SET NULL, igual ao original
--
-- Espelha `feedbacks_originais_contato_id_fkey`. Apagar um contato (LGPD, pedido
-- de exclusão) não pode apagar o feedback: o conteúdo continua valendo como
-- dado do restaurante, só perde o dono. As tabelas do motor usam CASCADE porque
-- lá a linha SÓ existe para falar com aquela pessoa — sem ela, não há o que
-- fazer com a linha.

alter table public.feedbacks_restaurante
  add column if not exists contato_id uuid
    references public.contatos(id) on delete set null;

comment on column public.feedbacks_restaurante.contato_id is
  'Dono da mensagem de onde este ponto veio. Preenchido pelo trigger a partir de feedbacks_originais.';

-- Backfill. Em 2026-08-27: 160 de 160 pontos resolveram para um contato.
update public.feedbacks_restaurante fr
   set contato_id = fo.contato_id
  from public.feedbacks_originais fo
 where fo.id = fr.origem_id
   and fr.contato_id is distinct from fo.contato_id
   and fo.contato_id is not null;

create or replace function public.preencher_contato_do_ponto()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  -- Valor explícito vence: o trigger completa, não corrige.
  if new.contato_id is null and new.origem_id is not null then
    select fo.contato_id into new.contato_id
      from public.feedbacks_originais fo
     where fo.id = new.origem_id;
  end if;
  return new;
end;
$$;

-- BEFORE, e não AFTER: em BEFORE a atribuição a `new` é a própria linha que vai
-- ser gravada. Em AFTER seria preciso um UPDATE extra, que dispararia os
-- triggers de update da tabela por uma coluna que ninguém editou.
drop trigger if exists trg_feedbacks_preencher_contato on public.feedbacks_restaurante;
create trigger trg_feedbacks_preencher_contato
before insert on public.feedbacks_restaurante
for each row execute function public.preencher_contato_do_ponto();

-- A consulta que este índice serve é "os pontos deste contato", que é
-- exatamente o que o motor de resposta faz por contato a cada tick.
create index if not exists feedbacks_restaurante_contato_idx
  on public.feedbacks_restaurante (contato_id)
  where contato_id is not null;

-- A view precisa ser recriada, mesmo tendo sido escrita como `select fr.*`.
--
-- `CREATE VIEW ... SELECT *` EXPANDE as colunas no momento da criação e as
-- congela ali. Coluna adicionada depois na tabela não aparece — a view continua
-- devolvendo a lista antiga, sem erro nenhum.
--
-- Vale para a view e NÃO vale para a função: `feedbacks_para_geracao` declara
-- `returns setof feedbacks_restaurante` e resolve o `fr.*` a cada execução, então
-- já devolvia `contato_id` sozinha. As duas parecem a mesma coisa e se comportam
-- diferente.
--
-- `contato_id` é a última coluna da tabela, então entra no fim da lista e o
-- OR REPLACE aceita (ele só recusa remover, renomear ou reordenar).
create or replace view public.feedbacks_livres as
select fr.*
from public.feedbacks_restaurante fr
where not exists (
        select 1 from public.insight_feedback vi
        join public.insights i on i.id = vi.insight_id
        where vi.feedback_restaurante_id = fr.id
          and i.ativo and i.deletado_em is null)
  and not exists (
        select 1 from public.feedback_acao fa
        where fa.feedback_restaurante_id = fr.id
           or (fa.feedback_restaurante_id is null
               and fa.feedback_original_id = fr.origem_id));
