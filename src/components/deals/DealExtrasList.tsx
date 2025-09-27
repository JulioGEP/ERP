import { DealRecord } from '../../services/deals'

type Props = { deal: DealRecord }

export function DealExtrasList({ deal }: Props) {
  const extras = deal.products_extras ?? []
  return (
    <div className="mb-3">
      <h4>Extras</h4>
      {extras.length === 0 ? (
        <p className="text-muted">No hay extras</p>
      ) : (
        <ul>
          {extras.map((p, i) => (
            <li key={i}>
              {p.name} ({p.quantity})
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
