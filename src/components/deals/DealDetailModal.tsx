import { useEffect, useMemo, useState } from 'react';
import Alert from 'react-bootstrap/Alert';
import Badge from 'react-bootstrap/Badge';
import Button from 'react-bootstrap/Button';
import Col from 'react-bootstrap/Col';
import Form from 'react-bootstrap/Form';
import ListGroup from 'react-bootstrap/ListGroup';
import Modal from 'react-bootstrap/Modal';
import Row from 'react-bootstrap/Row';
import Stack from 'react-bootstrap/Stack';
import Table from 'react-bootstrap/Table';
import { CalendarEvent } from '../../services/calendar';
import { DealAttachment, DealNote, DealProduct, DealRecord } from '../../services/deals';
import {
  loadDealExtras,
  persistDealExtras,
  StoredDealDocument,
  StoredDealNote
} from '../../services/dealExtras';

interface DealDetailModalProps {
  show: boolean;
  deal: DealRecord;
  events: CalendarEvent[];
  onHide: () => void;
  onUpdateSchedule: (dealId: number, events: CalendarEvent[]) => void;
  onDealRefetch: () => Promise<void> | void;
}

interface SessionFormEntry {
  key: string;
  dealProductId: number;
  productId: number | null;
  productName: string;
  recommendedHours: number | null;
  recommendedHoursRaw: string | null;
  sessionIndex: number;
  start: string;
  end: string;
  endTouched: boolean;
  attendees: string;
  sede: string;
  address: string;
}

type DisplayNote = DealNote;
type DisplayAttachment = DealAttachment;

const generateId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

const toDateTimeLocalString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const formatDateTimeInput = (iso: string | null | undefined): string => {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return toDateTimeLocalString(date);
};

const toIsoString = (value: string): string | null => {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
};

const computeEndFromStart = (start: string, hours: number | null): string => {
  if (!start || hours == null) {
    return '';
  }

  const date = new Date(start);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const milliseconds = hours * 60 * 60 * 1000;
  date.setTime(date.getTime() + milliseconds);
  return toDateTimeLocalString(date);
};

const formatDateLabel = (iso: string | null) => {
  if (!iso) {
    return 'Sin fecha';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Sin fecha';
  }

  return date.toLocaleString();
};

const resolveProductName = (
  dealProductId: number | null,
  productId: number | null,
  productMapByDealId: Map<number, string>,
  productMapByProductId: Map<number, string>
) => {
  if (dealProductId != null && productMapByDealId.has(dealProductId)) {
    return productMapByDealId.get(dealProductId) ?? null;
  }

  if (productId != null && productMapByProductId.has(productId)) {
    return productMapByProductId.get(productId) ?? null;
  }

  return null;
};

const countSessionsForProduct = (product: DealProduct) => {
  const quantity = Math.round(product.quantity);
  return quantity > 0 ? quantity : 1;
};

const DealDetailModal = ({
  show,
  deal,
  events,
  onHide,
  onUpdateSchedule,
  onDealRefetch
}: DealDetailModalProps) => {
  const [localNotes, setLocalNotes] = useState<StoredDealNote[]>([]);
  const [localDocuments, setLocalDocuments] = useState<StoredDealDocument[]>([]);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteTarget, setNoteTarget] = useState('general');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [showDocumentModal, setShowDocumentModal] = useState(false);
  const [documentName, setDocumentName] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentTarget, setDocumentTarget] = useState('general');
  const [documentError, setDocumentError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [mapVisible, setMapVisible] = useState(false);

  const productMap = useMemo(() => {
    const byDealProductId = new Map<number, string>();
    const byProductId = new Map<number, string>();

    [...deal.trainingProducts, ...deal.extraProducts].forEach((product) => {
      byDealProductId.set(product.dealProductId, product.name);
      if (product.productId != null) {
        byProductId.set(product.productId, product.name);
      }
    });

    return { byDealProductId, byProductId };
  }, [deal.extraProducts, deal.trainingProducts]);

  useEffect(() => {
    const extras = loadDealExtras(deal.id);
    setLocalNotes(extras.notes ?? []);
    setLocalDocuments(extras.documents ?? []);
    setNoteText('');
    setDocumentName('');
    setDocumentUrl('');
    setNoteTarget('general');
    setDocumentTarget('general');
    setSaveFeedback(null);
    setSaveError(null);
  }, [deal.id]);

  const eventsByKey = useMemo(() => {
    const map = new Map<string, CalendarEvent>();
    events
      .filter((eventItem) => eventItem.dealId === deal.id)
      .forEach((eventItem) => {
        const key = `${eventItem.dealProductId}-${eventItem.sessionIndex}`;
        map.set(key, eventItem);
      });
    return map;
  }, [deal.id, events]);

  const initialSessions = useMemo(() => {
    return deal.trainingProducts.flatMap((product) => {
      const sessionsCount = countSessionsForProduct(product);
      return Array.from({ length: sessionsCount }).map((_, index) => {
        const key = `${product.dealProductId}-${index}`;
        const existingEvent = eventsByKey.get(key);

        return {
          key,
          dealProductId: product.dealProductId,
          productId: product.productId,
          productName: product.name,
          recommendedHours: product.recommendedHours,
          recommendedHoursRaw: product.recommendedHoursRaw,
          sessionIndex: index,
          start: formatDateTimeInput(existingEvent?.start),
          end: formatDateTimeInput(existingEvent?.end),
          endTouched: Boolean(existingEvent?.end),
          attendees:
            existingEvent && existingEvent.attendees != null ? String(existingEvent.attendees) : '',
          sede: existingEvent?.sede ?? deal.sede ?? '',
          address: existingEvent?.address ?? deal.address ?? ''
        } satisfies SessionFormEntry;
      });
    });
  }, [deal.address, deal.sede, deal.trainingProducts, eventsByKey]);

  const [sessions, setSessions] = useState<SessionFormEntry[]>(initialSessions);

  useEffect(() => {
    setSessions(initialSessions);
  }, [initialSessions, show]);

  const localNoteEntries: DisplayNote[] = useMemo(
    () =>
      localNotes.map((note) => ({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        authorName: 'Equipo de planificación',
        source: 'local',
        productId: note.productId ?? null,
        dealProductId: note.dealProductId ?? null
      })),
    [localNotes]
  );

  const combinedNotes: DisplayNote[] = useMemo(() => {
    const joined = [...deal.notes, ...localNoteEntries];
    return joined.sort((a, b) => {
      const left = a.createdAt ?? '';
      const right = b.createdAt ?? '';
      return right.localeCompare(left);
    });
  }, [deal.notes, localNoteEntries]);

  const localAttachmentEntries: DisplayAttachment[] = useMemo(
    () =>
      localDocuments.map((document) => ({
        id: document.id,
        name: document.name,
        url: document.url,
        downloadUrl: document.url,
        fileType: null,
        addedAt: document.createdAt,
        addedBy: 'Equipo de planificación',
        source: 'local',
        productId: document.productId ?? null,
        dealProductId: document.dealProductId ?? null
      })),
    [localDocuments]
  );

  const combinedAttachments: DisplayAttachment[] = useMemo(() => {
    const joined = [...deal.attachments, ...localAttachmentEntries];
    return joined.sort((a, b) => {
      const left = a.addedAt ?? '';
      const right = b.addedAt ?? '';
      return right.localeCompare(left);
    });
  }, [deal.attachments, localAttachmentEntries]);

  const totalSessions = useMemo(
    () => deal.trainingProducts.reduce((acc, product) => acc + countSessionsForProduct(product), 0),
    [deal.trainingProducts]
  );

  const handleSessionStartChange = (key: string, value: string) => {
    setSessions((previous) =>
      previous.map((session) => {
        if (session.key !== key) {
          return session;
        }

        const updated: SessionFormEntry = {
          ...session,
          start: value
        };

        if (!session.endTouched) {
          const computed = computeEndFromStart(value, session.recommendedHours);
          if (computed) {
            updated.end = computed;
          }
        }

        return updated;
      })
    );
  };

  const handleSessionEndChange = (key: string, value: string) => {
    setSessions((previous) =>
      previous.map((session) =>
        session.key === key
          ? {
              ...session,
              end: value,
              endTouched: value.trim().length > 0
            }
          : session
      )
    );
  };

  const handleSessionFieldChange = (key: string, field: keyof SessionFormEntry, value: string) => {
    setSessions((previous) =>
      previous.map((session) =>
        session.key === key
          ? {
              ...session,
              [field]: value
            }
          : session
      )
    );
  };

  const persistExtras = (notes: StoredDealNote[], documents: StoredDealDocument[]) => {
    persistDealExtras(deal.id, { notes, documents });
  };

  const handleSaveSchedule = () => {
    setSaveError(null);
    setSaveFeedback(null);

    if (sessions.length === 0) {
      setSaveError('No hay productos de formación disponibles para calendarizar.');
      return;
    }

    const incomplete = sessions.filter((session) => !session.start || !session.end);

    if (incomplete.length > 0) {
      setSaveError('Todas las sesiones deben tener fecha y hora de inicio y fin.');
      return;
    }

    const eventsToSave: CalendarEvent[] = [];

    for (const session of sessions) {
      const startIso = toIsoString(session.start);
      const endIso = toIsoString(session.end);

      if (!startIso || !endIso) {
        setSaveError('Las fechas introducidas no son válidas.');
        return;
      }

      const attendeesValue = Number.parseInt(session.attendees, 10);
      const attendees = Number.isFinite(attendeesValue) ? attendeesValue : null;

      eventsToSave.push({
        id: `deal-${deal.id}-item-${session.dealProductId}-session-${session.sessionIndex}`,
        dealId: deal.id,
        dealTitle: deal.title,
        dealProductId: session.dealProductId,
        productId: session.productId,
        productName: session.productName,
        sessionIndex: session.sessionIndex,
        start: startIso,
        end: endIso,
        attendees,
        sede: session.sede.trim() ? session.sede.trim() : null,
        address: session.address.trim() ? session.address.trim() : null
      });
    }

    onUpdateSchedule(deal.id, eventsToSave);
    setSaveFeedback('La calendarización se guardó correctamente.');
  };

  const productOptions = useMemo(() => {
    const options = [...deal.trainingProducts, ...deal.extraProducts];
    return options.map((product) => ({
      label: product.name,
      value: `product-${product.dealProductId}`,
      dealProductId: product.dealProductId,
      productId: product.productId ?? null
    }));
  }, [deal.extraProducts, deal.trainingProducts]);

  const handleAddNote = () => {
    const trimmed = noteText.trim();

    if (!trimmed) {
      setNoteError('La nota no puede estar vacía.');
      return;
    }

    const now = new Date().toISOString();
    let dealProductId: number | undefined;
    let productId: number | undefined;
    let productName: string | undefined;

    if (noteTarget.startsWith('product-')) {
      const identifier = Number.parseInt(noteTarget.replace('product-', ''), 10);
      const matched = productOptions.find((option) => option.dealProductId === identifier);
      if (matched) {
        dealProductId = matched.dealProductId;
        productId = matched.productId ?? undefined;
        productName = matched.label;
      }
    }

    const note: StoredDealNote = {
      id: generateId(),
      content: trimmed,
      createdAt: now,
      dealProductId,
      productId,
      productName
    };

    const updatedNotes = [...localNotes, note];
    setLocalNotes(updatedNotes);
    persistExtras(updatedNotes, localDocuments);
    setShowNoteModal(false);
    setNoteText('');
    setNoteTarget('general');
    setNoteError(null);
  };

  const handleAddDocument = () => {
    const trimmedName = documentName.trim();
    const trimmedUrl = documentUrl.trim();

    if (!trimmedName) {
      setDocumentError('Introduce un nombre para el documento.');
      return;
    }

    try {
      const parsedUrl = new URL(trimmedUrl);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('Invalid protocol');
      }
    } catch (error) {
      setDocumentError('Introduce una URL válida.');
      return;
    }

    const now = new Date().toISOString();
    let dealProductId: number | undefined;
    let productId: number | undefined;
    let productName: string | undefined;

    if (documentTarget.startsWith('product-')) {
      const identifier = Number.parseInt(documentTarget.replace('product-', ''), 10);
      const matched = productOptions.find((option) => option.dealProductId === identifier);
      if (matched) {
        dealProductId = matched.dealProductId;
        productId = matched.productId ?? undefined;
        productName = matched.label;
      }
    }

    const document: StoredDealDocument = {
      id: generateId(),
      name: trimmedName,
      url: trimmedUrl,
      createdAt: now,
      dealProductId,
      productId,
      productName
    };

    const updatedDocuments = [...localDocuments, document];
    setLocalDocuments(updatedDocuments);
    persistExtras(localNotes, updatedDocuments);
    setShowDocumentModal(false);
    setDocumentName('');
    setDocumentUrl('');
    setDocumentTarget('general');
    setDocumentError(null);
  };

  const handleRefresh = async () => {
    try {
      setIsRefreshing(true);
      await onDealRefetch();
      setSaveError(null);
      setSaveFeedback('Datos actualizados desde Pipedrive.');
    } catch (error) {
      console.error('No se pudo refrescar el deal', error);
      setSaveError('No se pudieron actualizar los datos desde Pipedrive.');
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderNoteOrigin = (note: DisplayNote) => {
    if (note.source === 'deal') {
      return 'Deal';
    }

    const productName = resolveProductName(
      note.dealProductId,
      note.productId,
      productMap.byDealProductId,
      productMap.byProductId
    );

    if (note.source === 'local') {
      return productName ? `ERP · ${productName}` : 'ERP';
    }

    if (productName) {
      return `Producto · ${productName}`;
    }

    return 'Producto';
  };

  const renderAttachmentOrigin = (attachment: DisplayAttachment) => {
    if (attachment.source === 'deal') {
      return 'Deal';
    }

    const productName = resolveProductName(
      attachment.dealProductId,
      attachment.productId,
      productMap.byDealProductId,
      productMap.byProductId
    );

    if (attachment.source === 'local') {
      return productName ? `ERP · ${productName}` : 'ERP';
    }

    if (productName) {
      return `Producto · ${productName}`;
    }

    return 'Producto';
  };

  return (
    <>
      <Modal show={show} onHide={onHide} size="xl" backdrop="static" fullscreen="md-down">
        <Modal.Header closeButton>
          <div>
            <Modal.Title>Presupuesto #{deal.id}</Modal.Title>
            <div className="text-muted small">{deal.title}</div>
          </div>
        </Modal.Header>
        <Modal.Body>
          <Stack gap={4}>
            <Row className="g-4">
              <Col xl={7} lg={12}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">Datos generales</h5>
                  <Button variant="outline-secondary" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
                    {isRefreshing ? 'Actualizando…' : 'Actualizar desde Pipedrive'}
                  </Button>
                </div>
                <Row className="g-3">
                  <Col lg={6} md={6}>
                    <div className="d-flex flex-column gap-1 h-100">
                      <div className="text-uppercase text-muted small">Número de presupuesto</div>
                      <div className="fw-semibold">#{deal.id}</div>
                    </div>
                  </Col>
                  <Col lg={6} md={6}>
                    <div className="d-flex flex-column gap-1 h-100">
                      <div className="text-uppercase text-muted small">Cliente</div>
                      <div className="fw-semibold">
                        {deal.clientName ?? 'Sin organización asociada'}
                        {deal.clientId ? <span className="text-muted"> · #{deal.clientId}</span> : null}
                      </div>
                    </div>
                  </Col>
                  <Col lg={6} md={6}>
                    <div className="d-flex flex-column gap-1 h-100">
                      <div className="text-uppercase text-muted small">Tipo de formación</div>
                      <div className="fw-semibold">{deal.pipelineName ?? 'Sin embudo definido'}</div>
                    </div>
                  </Col>
                  <Col lg={6} md={6}>
                    <div className="d-flex flex-column gap-1 h-100">
                      <div className="text-uppercase text-muted small">Formación</div>
                      {deal.trainingProducts.length > 0 ? (
                        <Stack direction="horizontal" className="flex-wrap" gap={2}>
                          {deal.trainingProducts.map((product) => (
                            <Badge key={product.dealProductId} bg="info" text="dark" className="px-3 py-2 rounded-pill">
                              {product.name}
                            </Badge>
                          ))}
                        </Stack>
                      ) : (
                        <div className="text-muted">Sin productos formativos</div>
                      )}
                    </div>
                  </Col>
                  <Col lg={6} md={6}>
                    <div className="d-flex flex-column gap-1 h-100">
                      <div className="text-uppercase text-muted small">Número de sesiones</div>
                      <div className="fw-semibold">{totalSessions}</div>
                    </div>
                  </Col>
                  <Col lg={6} md={6}>
                    <div className="d-flex flex-column gap-1 h-100">
                      <div className="text-uppercase text-muted small">Sede</div>
                      <div className="fw-semibold">{deal.sede ?? 'Sin sede'}</div>
                    </div>
                  </Col>
                  <Col lg={12}>
                    <div className="d-flex flex-column gap-1 h-100">
                      <div className="text-uppercase text-muted small">Dirección de la formación</div>
                      {deal.address ? (
                        <Button variant="link" className="px-0" onClick={() => setMapVisible(true)}>
                          {deal.address}
                        </Button>
                      ) : (
                        <div className="text-muted">Sin dirección definida</div>
                      )}
                    </div>
                  </Col>
                  <Col lg={12}>
                    <div className="d-flex flex-column gap-1 h-100">
                      <div className="text-uppercase text-muted small">Horas recomendadas</div>
                      {deal.trainingProducts.length > 0 ? (
                        <ul className="mb-0 ps-3">
                          {deal.trainingProducts.map((product) => (
                            <li key={`hours-${product.dealProductId}`}>
                              <span className="fw-semibold">{product.name}:</span>{' '}
                              {product.recommendedHoursRaw ?? 'Sin información'}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="text-muted">Sin información disponible</div>
                      )}
                    </div>
                  </Col>
                </Row>
              </Col>
              <Col xl={5} lg={12}>
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <h5 className="mb-0">Extras</h5>
                </div>
                <Stack gap={3}>
                  <div className="border rounded p-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div>
                        <div className="text-uppercase text-muted small">Notas</div>
                        <div className="fw-semibold">Seguimiento</div>
                      </div>
                      <Button variant="outline-primary" size="sm" onClick={() => setShowNoteModal(true)}>
                        Añadir nota
                      </Button>
                    </div>
                    {combinedNotes.length > 0 ? (
                      <ListGroup variant="flush" className="border rounded">
                        {combinedNotes.map((note) => (
                          <ListGroup.Item key={note.id} className="py-3">
                            <div className="fw-semibold mb-1">{note.content || 'Sin contenido'}</div>
                            <div className="small text-muted d-flex flex-wrap gap-3">
                              <span>{renderNoteOrigin(note)}</span>
                              {note.authorName ? <span>Autor: {note.authorName}</span> : null}
                              {note.createdAt ? <span>{formatDateLabel(note.createdAt)}</span> : null}
                            </div>
                          </ListGroup.Item>
                        ))}
                      </ListGroup>
                    ) : (
                      <div className="text-muted">Sin notas registradas.</div>
                    )}
                  </div>
                  <div className="border rounded p-3">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <div>
                        <div className="text-uppercase text-muted small">Adjuntos</div>
                        <div className="fw-semibold">Documentación</div>
                      </div>
                      <Button variant="outline-primary" size="sm" onClick={() => setShowDocumentModal(true)}>
                        Añadir documento
                      </Button>
                    </div>
                    {combinedAttachments.length > 0 ? (
                      <Table size="sm" responsive className="mb-0">
                        <thead>
                          <tr>
                            <th>Documento</th>
                            <th>Origen</th>
                            <th className="text-end">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {combinedAttachments.map((attachment) => (
                            <tr key={attachment.id}>
                              <td>
                                <div className="fw-semibold">{attachment.name}</div>
                                {attachment.addedAt ? (
                                  <div className="small text-muted">{formatDateLabel(attachment.addedAt)}</div>
                                ) : null}
                              </td>
                              <td className="text-muted">{renderAttachmentOrigin(attachment)}</td>
                              <td className="text-end">
                                <Stack direction="horizontal" gap={2} className="justify-content-end">
                                  <Button
                                    as="a"
                                    variant="link"
                                    size="sm"
                                    href={attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Ver
                                  </Button>
                                  <Button
                                    as="a"
                                    variant="link"
                                    size="sm"
                                    href={attachment.downloadUrl ?? attachment.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                  >
                                    Descargar
                                  </Button>
                                </Stack>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-muted">Sin archivos disponibles.</div>
                    )}
                  </div>
                  <div className="border rounded p-3">
                    <div className="text-uppercase text-muted small mb-2">Productos extras</div>
                    {deal.extraProducts.length > 0 ? (
                      <Table responsive size="sm" className="mb-0">
                        <thead>
                          <tr>
                            <th>Producto</th>
                            <th>Cantidad</th>
                            <th>Notas</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deal.extraProducts.map((product) => (
                            <tr key={`extra-${product.dealProductId}`}>
                              <td>{product.name}</td>
                              <td>{product.quantity}</td>
                              <td>
                                {product.notes.length > 0 ? (
                                  <ul className="mb-0 ps-3">
                                    {product.notes.map((note) => (
                                      <li key={`extra-note-${note.id}`}>{note.content}</li>
                                    ))}
                                  </ul>
                                ) : (
                                  <span className="text-muted">Sin notas</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </Table>
                    ) : (
                      <div className="text-muted">No hay productos extras registrados.</div>
                    )}
                  </div>
                </Stack>
              </Col>
            </Row>

            <div>
              <h5 className="mb-3">Calendarización</h5>
              {saveFeedback && (
                <Alert variant="success" onClose={() => setSaveFeedback(null)} dismissible>
                  {saveFeedback}
                </Alert>
              )}
              {saveError && (
                <Alert variant="danger" onClose={() => setSaveError(null)} dismissible>
                  {saveError}
                </Alert>
              )}

              {deal.trainingProducts.length === 0 ? (
                <div className="text-muted">No hay productos de formación disponibles para calendarizar.</div>
              ) : (
                <Stack gap={3}>
                  {deal.trainingProducts.map((product) => {
                    const productSessions = sessions.filter((session) => session.dealProductId === product.dealProductId);
                    const sessionCount = countSessionsForProduct(product);
                    return (
                      <div key={`calendar-${product.dealProductId}`} className="border rounded p-3">
                        <div className="d-flex justify-content-between align-items-center mb-3">
                          <div>
                            <div className="fw-semibold">{product.name}</div>
                            <div className="text-muted small">
                              {sessionCount} sesión{sessionCount === 1 ? '' : 'es'} ·{' '}
                              {product.recommendedHoursRaw ?? 'Horas recomendadas no disponibles'}
                            </div>
                          </div>
                        </div>
                        <Stack gap={3}>
                          {productSessions.map((session) => (
                            <div key={session.key} className="border rounded p-3 bg-light">
                              <div className="fw-semibold mb-3">Sesión {session.sessionIndex + 1}</div>
                              <Row className="g-3">
                                <Col lg={3} md={6}>
                                  <Form.Group controlId={`start-${session.key}`}>
                                    <Form.Label>Hora y fecha inicio</Form.Label>
                                    <Form.Control
                                      type="datetime-local"
                                      value={session.start}
                                      onChange={(event) => handleSessionStartChange(session.key, event.target.value)}
                                    />
                                  </Form.Group>
                                </Col>
                                <Col lg={3} md={6}>
                                  <Form.Group controlId={`end-${session.key}`}>
                                    <Form.Label>Hora y fecha fin</Form.Label>
                                    <Form.Control
                                      type="datetime-local"
                                      value={session.end}
                                      onChange={(event) => handleSessionEndChange(session.key, event.target.value)}
                                    />
                                  </Form.Group>
                                </Col>
                                <Col lg={2} md={6}>
                                  <Form.Group controlId={`attendees-${session.key}`}>
                                    <Form.Label>Alumnos</Form.Label>
                                    <Form.Control
                                      type="number"
                                      min={0}
                                      value={session.attendees}
                                      onChange={(event) => handleSessionFieldChange(session.key, 'attendees', event.target.value)}
                                    />
                                  </Form.Group>
                                </Col>
                                <Col lg={2} md={6}>
                                  <Form.Group controlId={`sede-${session.key}`}>
                                    <Form.Label>Sede</Form.Label>
                                    <Form.Control
                                      type="text"
                                      value={session.sede}
                                      onChange={(event) => handleSessionFieldChange(session.key, 'sede', event.target.value)}
                                    />
                                  </Form.Group>
                                </Col>
                                <Col lg={4} md={12}>
                                  <Form.Group controlId={`address-${session.key}`}>
                                    <Form.Label>Dirección de la formación</Form.Label>
                                    <Form.Control
                                      type="text"
                                      value={session.address}
                                      onChange={(event) => handleSessionFieldChange(session.key, 'address', event.target.value)}
                                    />
                                  </Form.Group>
                                </Col>
                              </Row>
                            </div>
                          ))}
                        </Stack>
                      </div>
                    );
                  })}
                </Stack>
              )}
            </div>
          </Stack>
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <div className="text-muted small">
            Los cambios se guardan en el calendario interno de planificación.
          </div>
          <div className="d-flex gap-2">
            <Button variant="secondary" onClick={onHide}>
              Cerrar
            </Button>
            <Button variant="primary" onClick={handleSaveSchedule} disabled={deal.trainingProducts.length === 0}>
              Guardar en calendario
            </Button>
          </div>
        </Modal.Footer>
      </Modal>

      <Modal show={showNoteModal} onHide={() => setShowNoteModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Añadir nota</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {noteError && (
            <Alert variant="danger" onClose={() => setNoteError(null)} dismissible>
              {noteError}
            </Alert>
          )}
          <Stack gap={3}>
            <Form.Group controlId="note-content">
              <Form.Label>Contenido</Form.Label>
              <Form.Control
                as="textarea"
                rows={4}
                value={noteText}
                onChange={(event) => setNoteText(event.target.value)}
                placeholder="Añade aquí la nota para el equipo de planificación"
              />
            </Form.Group>
            <Form.Group controlId="note-target">
              <Form.Label>Asociar a</Form.Label>
              <Form.Select value={noteTarget} onChange={(event) => setNoteTarget(event.target.value)}>
                <option value="general">General</option>
                {productOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowNoteModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleAddNote}>
            Guardar nota
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={showDocumentModal} onHide={() => setShowDocumentModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title>Añadir documento</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {documentError && (
            <Alert variant="danger" onClose={() => setDocumentError(null)} dismissible>
              {documentError}
            </Alert>
          )}
          <Stack gap={3}>
            <Form.Group controlId="document-name">
              <Form.Label>Nombre</Form.Label>
              <Form.Control
                type="text"
                value={documentName}
                onChange={(event) => setDocumentName(event.target.value)}
                placeholder="Ej. Programa del curso"
              />
            </Form.Group>
            <Form.Group controlId="document-url">
              <Form.Label>URL</Form.Label>
              <Form.Control
                type="url"
                value={documentUrl}
                onChange={(event) => setDocumentUrl(event.target.value)}
                placeholder="https://..."
              />
            </Form.Group>
            <Form.Group controlId="document-target">
              <Form.Label>Asociar a</Form.Label>
              <Form.Select value={documentTarget} onChange={(event) => setDocumentTarget(event.target.value)}>
                <option value="general">General</option>
                {productOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
          </Stack>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowDocumentModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleAddDocument}>
            Guardar documento
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal show={mapVisible} onHide={() => setMapVisible(false)} size="lg" centered>
        <Modal.Header closeButton>
          <Modal.Title>Ubicación de la formación</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {deal.address ? (
            <div className="ratio ratio-16x9">
              <iframe
                title="Ubicación"
                src={`https://www.google.com/maps?q=${encodeURIComponent(deal.address)}&output=embed`}
                allowFullScreen
              />
            </div>
          ) : (
            <div className="text-muted">No se ha definido una dirección.</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            as="a"
            href={deal.address ? `https://www.google.com/maps?q=${encodeURIComponent(deal.address)}` : '#'}
            target="_blank"
            rel="noopener noreferrer"
            variant="primary"
            disabled={!deal.address}
          >
            Abrir en Google Maps
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default DealDetailModal;
