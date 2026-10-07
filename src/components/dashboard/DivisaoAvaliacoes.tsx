import type { DashboardData } from '@/lib/queries/visao-geral'

/* "Como as avaliações se dividem": positivas, neutras, negativas e sugestões em
   % e a barra. Na Visão Geral dos restaurantes e no EasyFeed Influencers. */
export function DivisaoAvaliacoes({ kpis }: { kpis: DashboardData['kpis'] }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6">
      <h3 className="text-base font-bold text-gray-900">Como as avaliações se dividem</h3>
      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="flex shrink-0 flex-wrap gap-x-6 gap-y-3">
          {[
            { valor: kpis.positivePercent, cor: 'text-green-600', dot: 'bg-green-500', label: 'Positivas' },
            { valor: kpis.neutralPercent, cor: 'text-slate-500', dot: 'bg-slate-400', label: 'Neutras' },
            { valor: kpis.negativePercent, cor: 'text-red-500', dot: 'bg-red-500', label: 'Negativas' },
            { valor: kpis.suggestionPercent, cor: 'text-sky-600', dot: 'bg-sky-500', label: 'Sugestões' },
          ].map((s) => (
            <div key={s.label}>
              <p className={`text-2xl font-bold ${s.cor}`}>{s.valor}%</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                <span className={`h-2 w-2 rounded-full ${s.dot}`} />
                {s.label}
              </p>
            </div>
          ))}
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="flex h-full w-full">
            {[
              { n: kpis.positivos, cor: 'bg-green-500' },
              { n: kpis.neutros, cor: 'bg-slate-400' },
              { n: kpis.negativos, cor: 'bg-red-500' },
              { n: kpis.sugestoes, cor: 'bg-sky-500' },
            ].map((s, i) =>
              s.n > 0 ? (
                <div key={i} className={s.cor} style={{ width: `${(s.n / kpis.totalFeedbacks) * 100}%` }} />
              ) : null,
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
