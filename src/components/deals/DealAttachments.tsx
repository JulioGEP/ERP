type Props = { attachments: { id: number; file_name: string; url: string }[] }

export function DealAttachments({ attachments }: Props) {
  return (
    <div className="mb-3">
      <h4>Adjuntos</h4>
      {attachments.length === 0 ? (
        <p className="text-muted">No hay adjuntos</p>
      ) : (
        <ul>
          {attachments.map((a) => (
            <li key={a.id}>
              <a href={a.url} target="_blank" rel="noreferrer">
                {a.file_name}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
