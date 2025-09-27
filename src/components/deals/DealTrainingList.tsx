import { DealRecord } from '../../services/deals'

type Props = { deal: DealRecord }

export function DealTrainingList({ deal }: Props) {
  const trainings = deal.products_form ?? []
  return (
    <div className="mb-3">
      <h4>Formaciones</h4>
      {trainings.length === 0 ? (
        <p className="text-muted">No hay formaciones</p>
      ) : (
        <ul>
          {trainings.map((p, i) => (
            <li key={i}>
              {p.name} ({p.quantity})
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
