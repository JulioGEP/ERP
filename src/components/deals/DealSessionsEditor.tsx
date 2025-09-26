import React, { useMemo, useState } from "react";
import { Table, Modal, Form, Button, Row, Col } from "react-bootstrap";

export type Trainer = {
  id: string;
  name: string;
};

export type UnidadMovil = {
  id: string;
  name: string;
};

export type DealSession = {
  id: string;
  dataStart: string; // ISO string (ej. "2025-09-26T09:00:00Z" o local)
  dataEnd: string;   // ISO string
  trainerId?: string | null;
  unidadMovilId?: string | null;
};

/** Props del editor de sesiones */
type DealSessionsEditorProps = {
  sessions: DealSession[];
  trainers: Trainer[];
  unidadesMoviles: UnidadMovil[];
  onAddSession: (payload: Omit<DealSession, "id">) => void | Promise<void>;
  onUpdateSession: (id: string, payload: Omit<DealSession, "id">) => void | Promise<void>;
  onDeleteSession: (id: string) => void | Promise<void>;
};

/** Convierte ISO/fecha a valor válido para <input type="datetime-local"> */
function toDatetimeLocal(value?: string): string {
  if (!value) return "";
  try {
    const d = new Date(value);
    // Ajuste a zona local y formato YYYY-MM-DDTHH:MM
    const pad = (n: number) => String(n).padStart(2, "0");
    const yyyy = d.getFullYear();
    const mm = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const hh = pad(d.getHours());
    const mi = pad(d.getMinutes());
    return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
  } catch {
    return value;
  }
}

/** Devuelve ISO desde un valor de datetime-local (sin zona) asumiendo hora local */
function fromDatetimeLocal(localValue: string): string {
  if (!localValue) return "";
  // Construimos fecha en local y la serializamos en ISO
  const d = new Date(localValue);
  return d.toISOString();
}

const emptyForm: Omit<DealSession, "id"> = {
  dataStart: "",
  dataEnd: "",
  trainerId: "",
  unidadMovilId: "",
};

type Mode = "add" | "edit";

const DealSessionsEditor: React.FC<DealSessionsEditorProps> = ({
  sessions,
  trainers,
  unidadesMoviles,
  onAddSession,
  onUpdateSession,
  onDeleteSession,
}) => {
  const [show, setShow] = useState(false);
  const [mode, setMode] = useState<Mode>("add");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<DealSession, "id">>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const trainersById = useMemo(() => {
    const m = new Map<string, Trainer>();
    trainers?.forEach((t) => m.set(t.id, t));
    return m;
  }, [trainers]);

  const umById = useMemo(() => {
    const m = new Map<string, UnidadMovil>();
    unidadesMoviles?.forEach((u) => m.set(u.id, u));
    return m;
  }, [unidadesMoviles]);

  const reset = () => {
    setTargetId(null);
    setForm(emptyForm);
    setSubmitting(false);
  };

  const openAdd = () => {
    setMode("add");
    reset();
    setShow(true);
  };

  const openEdit = (s: DealSession) => {
    setMode("edit");
    setTargetId(s.id);
    setForm({
      dataStart: s.dataStart,
      dataEnd: s.dataEnd,
      trainerId: s.trainerId ?? "",
      unidadMovilId: s.unidadMovilId ?? "",
    });
    setShow(true);
  };

  const close = () => {
    setShow(false);
    setTimeout(() => reset(), 150);
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.dataStart || !form.dataEnd) return;
    setSubmitting(true);

    const payload: Omit<DealSession, "id"> = {
      ...form,
      dataStart:
        form.dataStart.includes("T") && form.dataStart.length > 16
          ? form.dataStart
          : fromDatetimeLocal(form.dataStart),
      dataEnd:
        form.dataEnd.includes("T") && form.dataEnd.length > 16
          ? form.dataEnd
          : fromDatetimeLocal(form.dataEnd),
      trainerId: form.trainerId || undefined,
      unidadMovilId: form.unidadMovilId || undefined,
    };

    try {
      if (mode === "add") {
        await onAddSession(payload);
      } else if (mode === "edit" && targetId) {
        await onUpdateSession(targetId, payload);
      }
      close();
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta sesión?")) return;
    await onDeleteSession(id);
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5 className="m-0">Sesiones</h5>
        <Button variant="primary" size="sm" onClick={openAdd}>
          Añadir sesión
        </Button>
      </div>

      <Table striped bordered hover size="sm" responsive>
        <thead>
          <tr>
            <th>Inicio</th>
            <th>Fin</th>
            <th>Formador</th>
            <th>Unidad móvil</th>
            <th style={{ width: 140 }}>Acciones</th>
          </tr>
        </thead>
        <tbody>
          {(sessions ?? []).length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-muted">
                No hay sesiones.
              </td>
            </tr>
          )}
          {(sessions ?? []).map((s) => {
            const t = s.trainerId ? trainersById.get(s.trainerId) : undefined;
            const um = s.unidadMovilId ? umById.get(s.unidadMovilId) : undefined;
            const dStart = new Date(s.dataStart);
            const dEnd = new Date(s.dataEnd);
            const fmt = (d: Date) =>
              isNaN(d.getTime())
                ? ""
                : d.toLocaleString(undefined, {
                    year: "2-digit",
                    month: "2-digit",
                    day: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

            return (
              <tr key={s.id}>
                <td>{fmt(dStart)}</td>
                <td>{fmt(dEnd)}</td>
                <td>{t?.name ?? "—"}</td>
                <td>{um?.name ?? "—"}</td>
                <td>
                  <div className="d-flex gap-2">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => openEdit(s)}
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outline-danger"
                      size="sm"
                      onClick={() => handleDelete(s.id)}
                    >
                      Eliminar
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      <Modal show={show} onHide={close} centered>
        <Form onSubmit={handleSubmit}>
          <Modal.Header closeButton>
            <Modal.Title>
              {mode === "add" ? "Añadir sesión" : "Editar sesión"}
            </Modal.Title>
          </Modal.Header>
          <Modal.Body>
            <Row className="g-3">
              <Col md={6}>
                <Form.Group controlId="dataStart">
                  <Form.Label>Fecha inicio</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    name="dataStart"
                    value={toDatetimeLocal(form.dataStart)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dataStart: e.target.value }))
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="dataEnd">
                  <Form.Label>Fecha fin</Form.Label>
                  <Form.Control
                    type="datetime-local"
                    name="dataEnd"
                    value={toDatetimeLocal(form.dataEnd)}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, dataEnd: e.target.value }))
                    }
                    required
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="trainerId">
                  <Form.Label>Formador</Form.Label>
                  <Form.Select
                    name="trainerId"
                    value={form.trainerId ?? ""}
                    onChange={handleChange}
                  >
                    <option value="">— Sin asignar —</option>
                    {trainers.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="unidadMovilId">
                  <Form.Label>Unidad móvil</Form.Label>
                  <Form.Select
                    name="unidadMovilId"
                    value={form.unidadMovilId ?? ""}
                    onChange={handleChange}
                  >
                    <option value="">— Sin asignar —</option>
                    {unidadesMoviles.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
          </Modal.Body>
          <Modal.Footer>
            <Button variant="secondary" onClick={close} disabled={submitting}>
              Cancelar
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {mode === "add" ? "Crear sesión" : "Guardar cambios"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>
    </>
  );
};

export default DealSessionsEditor;
