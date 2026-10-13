-- Workflow "Feedback Restaurante": o nó "Quem escreveu?" passa a receber também
-- `so_rh` (a conta é só da versão RH, de uma empresa) e `ramo`.
--
-- Para que servem no workflow:
--   - `ignorar` (já existia): conta só de RH e número que não é de funcionário,
--     o fluxo para sem responder e sem registrar;
--   - `so_rh`: as mensagens da Helena para a equipe dizem "empresa" em vez de
--     "restaurante" quando a conta não tem nome, e a IA que separa o feedback
--     em pontos recebe o aviso de que não é um restaurante;
--   - `ramo`: entra nesse aviso.
-- A conta do admin, que usa as duas versões, NUNCA é `so_rh`: ela é um
-- restaurante que também ouve a equipe.
--
-- Pode rodar mais de uma vez.

create or replace function public.equipe_quem_e(p_restaurante_id bigint, p_telefone text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with conta as (
    select coalesce((select r.area = 'rh' from public.restaurantes r where r.id = p_restaurante_id), false)
             and not public.conta_usa_as_duas_versoes(p_restaurante_id) as so_rh,
           (select nullif(btrim(r.ramo), '') from public.restaurantes r where r.id = p_restaurante_id) as ramo
  )
  select coalesce((
    select jsonb_build_object(
      'ok', true,
      'funcionario_id', f.id,
      'nome', f.nome,
      'ignorar', false,
      'so_rh', c.so_rh,
      'ramo', case when c.so_rh then c.ramo end,
      -- Já recebeu a pergunta do anonimato há pouco: "anônimo" escrito por
      -- extenso também vale como resposta.
      'pode_escolher', exists (
        select 1 from public.equipe_autorias a
         where a.funcionario_id = f.id
           and a.perguntado_em > now() - interval '7 days'),
      -- A pergunta está no ar agora (feita e ainda no prazo): só aqui um
      -- "sim" ou "não" solto vale como resposta a ela.
      'aguardando_escolha', exists (
        select 1 from public.equipe_autorias a
         where a.funcionario_id = f.id
           and a.identidade = 'pendente'
           and a.perguntado_em is not null
           and (a.identidade_ate is null or a.identidade_ate > now())))
      from public.equipe_funcionarios f, conta c
     where f.restaurante_id = p_restaurante_id
       and f.ativo
       and public.telefone_chave(f.telefone) = public.telefone_chave(p_telefone)
     limit 1
  ), (
    -- Não é funcionário. Conta só de RH: não existe conversa de cliente, o
    -- fluxo para. Conta de restaurante (ou a do admin, que usa as duas): é
    -- cliente, segue normal.
    select jsonb_build_object('ok', true, 'funcionario_id', null, 'ignorar', c.so_rh, 'so_rh', c.so_rh) from conta c
  ))
$$;
