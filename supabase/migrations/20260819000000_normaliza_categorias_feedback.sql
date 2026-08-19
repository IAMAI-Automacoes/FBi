-- Normaliza os valores de `categoria` pro conjunto canônico de 14 categorias
-- (definido pelo dono, 2026-08-19): Comida, Bebidas, Atendimento, Ambiente,
-- Limpeza, Preço, Tempo de Espera, Reserva, Estacionamento, Acessibilidade,
-- Música/Som, Cardápio/Variedade, Higiene, Outros.
--
-- O n8n já foi reconfigurado pra só gerar essas 14 categorias daqui pra
-- frente. Esta migration só corrige o que já estava gravado com nomes
-- antigos/inconsistentes, em TODAS as contas:
--   "Servico"                 -> "Atendimento"    (serviço = atendimento)
--   "Preco"                   -> "Preço"          (sem cedilha)
--   "Preço/Custo-benefício"   -> "Preço"          (rótulo antigo mais longo)
--   "Agilidade"               -> "Tempo de Espera"
--   "Geral"                   -> "Outros"         (fallback antigo de categoria vazia)
--
-- Afeta as 3 tabelas que guardam `categoria`: feedbacks_restaurante (a fonte),
-- e insights/acoes_operacionais (que herdam a categoria do feedback via IA).

update public.feedbacks_restaurante
set categoria = case categoria
  when 'Servico' then 'Atendimento'
  when 'Preco' then 'Preço'
  when 'Preço/Custo-benefício' then 'Preço'
  when 'Agilidade' then 'Tempo de Espera'
  when 'Geral' then 'Outros'
  else categoria
end
where categoria in ('Servico', 'Preco', 'Preço/Custo-benefício', 'Agilidade', 'Geral');

update public.insights
set categoria = case categoria
  when 'Servico' then 'Atendimento'
  when 'Preco' then 'Preço'
  when 'Preço/Custo-benefício' then 'Preço'
  when 'Agilidade' then 'Tempo de Espera'
  when 'Geral' then 'Outros'
  else categoria
end
where categoria in ('Servico', 'Preco', 'Preço/Custo-benefício', 'Agilidade', 'Geral');

update public.acoes_operacionais
set categoria = case categoria
  when 'Servico' then 'Atendimento'
  when 'Preco' then 'Preço'
  when 'Preço/Custo-benefício' then 'Preço'
  when 'Agilidade' then 'Tempo de Espera'
  when 'Geral' then 'Outros'
  else categoria
end
where categoria in ('Servico', 'Preco', 'Preço/Custo-benefício', 'Agilidade', 'Geral');
