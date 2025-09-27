type Props = { notes: { id: number; content?: string }[] }

export function DealNotes({ notes }: Props) {
  return (
    <div className="mb-3">
      <h4>Notas</h4>
      {notes.length === 0 ? (
        <p className="text-muted">No hay notas</p>
      ) : (
        <ul>
          {notes.map((n) => (
            <li key={n.id}>{n.content}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
