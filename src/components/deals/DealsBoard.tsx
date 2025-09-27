import { useState } from 'react'
import DealDetailModal from './DealDetailModal'
import { DealRecord, fetchDeals } from '../../services/deals'

export function DealsBoard() {
  const [deals, setDeals] = useState<DealRecord[]>([])
  const [selected, setSelected] = useState<DealRecord | null>(null)

  // Aquí podrías usar useEffect para cargar deals con fetchDeals()

  return (
    <div>
      <h3>Deals</h3>
      <ul>
        {deals.map((d) => (
          <li key={d.id} onClick={() => setSelected(d)}>
            {d.title}
          </li>
        ))}
      </ul>

      {selected && (
        <DealDetailModal
          deal={selected}
          notes={[]} // sustituir por datos reales
          attachments={[]} // sustituir por datos reales
          sessions={[]} // sustituir por datos reales
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

export default DealsBoard
