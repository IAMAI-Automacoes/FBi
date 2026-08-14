-- As "perguntas de validação" saíram do produto por decisão do dono.
--
-- O trigger disparava gerar-perguntas-direcionadas (via pg_net) a cada ação
-- criada ou aprovada, gastando crédito de IA para gerar perguntas que ninguém
-- mais lê. Removido junto com a tabela e as policies.
--
-- ATENÇÃO: se algum workflow do n8n lia `perguntas_direcionadas.ativa`, ele
-- passa a não encontrar a tabela. O webhook-n8n deste repositório NÃO a
-- referencia.

drop trigger if exists trg_acoes_operacionais_perguntas on public.acoes_operacionais;
drop function if exists public.trg_call_gerar_perguntas();
drop table if exists public.perguntas_direcionadas cascade;
