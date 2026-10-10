-- Missões de vídeo: o admin cria cada missão do zero.
--   · sai a semente de 20261010000000 (as 2 missões de exemplo), se nenhum
--     restaurante mandou vídeo para elas;
--   · toda missão tem duração mínima e máxima definidas pelo admin (até 5 min:
--     mais que isso a análise passa do tempo da função) e roteiro, que é o que
--     o restaurante vê para gravar.

delete from public.video_missoes m
 where m.titulo in ('Depoimento sobre o EasyFeed', 'Mostre o QR Code')
   and not exists (select 1 from public.video_envios e where e.missao_id = m.id);

-- Se sobrou alguma missão antiga sem duração ou roteiro, completa com o que valia antes.
update public.video_missoes
   set duracao_min_s = coalesce(duracao_min_s, 0),
       duracao_max_s = coalesce(duracao_max_s, 180),
       roteiro = case when btrim(roteiro) = '' then coalesce(nullif(btrim(descricao), ''), titulo) else roteiro end
 where duracao_min_s is null or duracao_max_s is null or btrim(roteiro) = '';

alter table public.video_missoes
  alter column duracao_min_s set not null,
  alter column duracao_max_s set not null;

alter table public.video_missoes drop constraint if exists video_missoes_duracao_ok;
alter table public.video_missoes add constraint video_missoes_duracao_ok check (
  duracao_min_s between 0 and 300
  and duracao_max_s between 5 and 300
  and duracao_min_s < duracao_max_s
);

alter table public.video_missoes drop constraint if exists video_missoes_roteiro_ok;
alter table public.video_missoes add constraint video_missoes_roteiro_ok check (btrim(roteiro) <> '');

comment on column public.video_missoes.duracao_min_s is 'Duração mínima do vídeo, em segundos (0 = sem mínimo). O admin define.';
comment on column public.video_missoes.duracao_max_s is 'Duração máxima do vídeo, em segundos (até 300). O admin define.';
