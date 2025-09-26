// src/components/deals/DealNotes.tsx
import React, { useMemo, useState } from "react";
import { Card, Form, Button } from "react-bootstrap";

export type DealNote = {
  id?: string | number;
  content: string;
  createdAt?: string | Date | null;
  author?: string | null;
};

type DealNotesProps = {
  /** Lista de notas del deal */
  notes: DealNote[];
  /** Callback para añadir una nueva nota. Debe guardar la nota en origen (API/estado padre). */
  onAddNote: (text: string) => Promise<void> | void;
  /** Opcional: deshabilita el formulario de nuevas notas (ej. si el deal es de solo lectura) */
  disabled?: boolean;
  /** Opcional: placeholder del textarea */
  placeholder?: string;
  /** Opcional: texto del botón */
  addButtonLabel?: string;
};

const formatDate = (d?: string | Date | null) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  // Formato compacto local (ej. 26/09/2025 17:45)
  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
};

const DealNotes: React.FC<DealNotesProps> = ({
  notes,
  onAddNote,
  disabled = false,
  placeholder = "Escribe una nota…",
  addButtonLabel = "Añadir nota",
}) => {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = text.trim().length > 0 && !disabled && !submitting;

  const orderedNotes = useMemo(() => {
    // Mostramos primero las más recientes si tienen fecha
    return [...(notes || [])].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [notes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const payload = text.trim();
    setSubmitting(true);
    try {
      await onAddNote(payload);
      setText("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="mb-3">
      <Card.Header className="d-flex align-items-center justify-content-between">
        <span>Notas</span>
        <small className="text-muted">
          {orderedNotes.length} {orderedNotes.length === 1 ? "nota" : "notas"}
        </small>
      </Card.Header>

      <Card.Body>
        {orderedNotes.length === 0 ? (
          <div className="text-muted mb-3">Sin notas todavía.</div>
        ) : (
          <div className="d-flex flex-column gap-3 mb-3">
            {orderedNotes.map((n, idx) => (
              <div
                key={n.id ?? `note-${idx}`}
                className="border rounded p-2 bg-light"
              >
                <div className="d-flex justify-content-between align-items-start">
                  <strong className="me-2">
                    {n.author?.trim() || "Anónimo"}
                  </strong>
                  <small className="text-muted">{formatDate(n.createdAt)}</small>
                </div>
                <div className="mt-1" style={{ whiteSpace: "pre-wrap" }}>
                  {n.content}
                </div>
              </div>
            ))}
          </div>
        )}

        <Form onSubmit={handleSubmit}>
          <Form.Group controlId="dealNoteTextarea" className="mb-2">
            <Form.Label className="fw-semibold">Añadir nueva nota</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={text}
              placeholder={placeholder}
              onChange={(e) => setText(e.target.value)}
              disabled={disabled || submitting}
            />
          </Form.Group>
          <div className="d-flex justify-content-end">
            <Button
              variant="primary"
              type="submit"
              disabled={!canSubmit}
              aria-disabled={!canSubmit}
            >
              {submitting ? "Guardando…" : addButtonLabel}
            </Button>
          </div>
        </Form>
      </Card.Body>
    </Card>
  );
};

export default DealNotes;
