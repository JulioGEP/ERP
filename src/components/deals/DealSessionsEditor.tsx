type Session = {
  id: number
  startAt: string
  endAt: string
  trainerId?: number
  sede?: string
}

type Props = { sessions: Session[] }

export function DealSessionsEditor({ sessions }: Props) {
  return (
    <div className="mb-3">
      <h4>Sesiones</h4>
      {sessions.length === 0 ? (
        <p className="text-muted">No hay sesiones programadas</p>
      ) : (
        <ul>
          {sessions.map((s) => (
            <li key={s.id}>
              {new Date(s.startAt).toLocaleString()} → {new Date(s.endAt).toLocaleString()} 
              {s.trainerId && ` (Trainer ${s.trainerId})`}
            </li>
          ))}
        </ul>
      )}
      {/* 🚀 Aquí puedes añadir botones para crear/editar sesiones */}
    </div>
  )
}
