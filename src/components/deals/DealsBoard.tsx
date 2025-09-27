import { useState, useEffect } from 'react'
import DealDetailModal from './DealDetailModal'
import { DealRecord, fetchDeals, fetchDealById } from '../../services/deals'
import { fetchAttachments, Attachment } from '../../services/attachments'

type Note = { id: number; content?: string }
type Session = { id: number; dealId: number; startAt: string; endAt: string; trainerId?: number; sede?: string }

function DealsBoard() {
  const [deals, setDeals] = useState<DealRecord[]>([])
  const [selected, setSelected] = useState<DealRecord | null>(null)
  const [notes, setNotes] = useState<Note[]>([])
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(false)

  // Cargar deals al montar
  useEffect(() => {
    fetchDeals()
      .then(setDeals)
      .catch((err) => console.error('[DealsBoard] fetchDeals error', err))
  }, [])

  async function openDeal(deal: DealRecord) {
    setLoading(true)
    try {
      // 1) Detalle completo
      const full = await fetchDealById(deal.id)
      setSelected(full)

      // 2) Notas
      const notesRes = await fetch(`/api/notes?dealId=${deal.id}`).then((r) => r.json())
      setNotes(Array.isArray(notesRes) ? notesRes : [])

      // 3) Sesiones
      const sessionsRes = await fetch(`/api/calendar/events`).then((r) => r.json())
      const filteredSessions = (Array.isArray(sessionsRes) ? sessionsRes : []).filter(
        (s: any) => s.dealId === deal.id
      )
      setSessions(filteredSessions)

      // 4) Adjuntos (servicio)
      const atts = await fetchAttachments(deal.id)
      setAttachments(atts)
    } catch (err) {
      console.error('[DealsBoard] openDeal error', err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h3>Deals</h3>
      {deals.length === 0 && <p className="text-muted">No hay deals en pipeline 3</p>}
      <ul>
        {deals.map((d) => (
          <li key={d.id} onClick={() => openDeal(d)} style={{ cursor: 'pointer' }}>
            {d.title}
          </li>
        ))}
      </ul>

      {loading && <p className="text-muted">Cargando…</p>}

      {selected && (
        <DealDetailModal
          deal={selected}
          notes={notes}
          attachments={attachments}
          sessions={sessions}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

export default DealsBoard
