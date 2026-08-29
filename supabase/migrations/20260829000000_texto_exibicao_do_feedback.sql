-- A view reconstrói o texto quando a mensagem original se perdeu.
--
-- ## O que aconteceu
--
-- 2 dos 71 feedbacks originais têm `texto_original` E `texto_destacado` nulos.
-- O n8n gravou os TRÊS pontos separados de cada um, com texto e tudo — só a
-- mensagem inteira não entrou. Os pontos estão lá: "A comida veio fria",
-- "Os garçons pareciam que tinham começado a trabalhar ontem", "O ambiente do
-- restaurante é bem agradável".
--
-- Na tela isso derrubava a página inteira (`.split()` de null). O componente já
-- foi endurecido para não quebrar — mas mostrar um card vazio para um feedback
-- cujo conteúdo o sistema TEM é desperdício.
--
-- ## A solução é a que a view já usa
--
-- Esta view já deriva `sentimento` e `categorias` dos pontos quando a mensagem
-- original não os traz. `texto_exibicao` faz o mesmo com o texto: usa o
-- destacado, senão o original, senão junta os pontos.
--
-- A coluna é nova e vai no fim, então `CREATE OR REPLACE VIEW` aceita (ele só
-- recusa remover, renomear ou reordenar). `texto_original` e `texto_destacado`
-- continuam expostas como estão — quem precisa do dado cru continua tendo.

create or replace view public.feedbacks_originais_view as
select
  o.id,
  o.restaurante_id,
  o.texto_original,
  o.texto_destacado,
  o.telefone_cliente,
  o.created_at,
  coalesce(
    o.sentimento,
    case
      when bool_or(lower(f.sentimento) = any (array['negativo','negative']))
       and bool_or(lower(f.sentimento) = any (array['positivo','positive']))
        then 'positivo e negativo'
      when bool_or(lower(f.sentimento) = any (array['negativo','negative'])) then 'negativo'
      when bool_or(lower(f.sentimento) = any (array['positivo','positive'])) then 'positivo'
      else 'neutro'
    end
  ) as sentimento,
  array_remove(array_agg(distinct f.categoria), null::text) as categorias,
  -- O que a tela mostra. Precedência: destacado (com os ** da IA), original, e
  -- por último os pontos separados costurados — que é melhor que nada quando a
  -- mensagem inteira se perdeu.
  coalesce(
    o.texto_destacado,
    o.texto_original,
    nullif(
      string_agg(
        distinct coalesce(f.texto_original, f.resumo),
        '. '
      ),
      ''
    )
  ) as texto_exibicao
from public.feedbacks_originais o
left join public.feedbacks_restaurante f on f.origem_id = o.id
group by o.id, o.restaurante_id, o.texto_original, o.texto_destacado,
         o.telefone_cliente, o.created_at, o.sentimento;
