import { DealRecord } from '../../services/deals'

type Props = { deal: DealRecord }

export function DealHeader({ deal }: Props) {
  return (
    <div className="deal-header mb-3">
      <h2>{deal.title}</h2>
      <p className="text-muted">Sede: {deal.sede ?? '—'}</p>
      {deal.hotel_pernocta && <span className="badge bg-info me-1">Hotel incluido</span>}
      {deal.fundae && <span className="badge bg-success me-1">FUNDAE</span>}
      {deal.caes && <span className="badge bg-warning text-dark">CAES</span>}
    </div>
  )
}
