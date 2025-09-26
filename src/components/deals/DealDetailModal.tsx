import React, { useState } from "react";
import { Card, Row, Col, Form, Badge, Button } from "react-bootstrap";
import type { Deal } from "./DealDetailModal";

export interface DealHeaderProps {
  deal: Deal;
  onSaveDeal?: (patch: Partial<Deal>) => void | Promise<void>;
  readOnly?: boolean;
}

/**
 * Cabecera del Deal: cliente, sede, dirección, status
 * - Muestra datos y permite edición inline de Sede/Dirección/Status si no es readOnly
 * - Mantiene un layout limpio usando react-bootstrap
 */
export const DealHeader: React.FC<DealHeaderProps> = ({
  deal,
  onSaveDeal,
  readOnly = true,
}) => {
  const [local, setLocal] = useState({
    sede: deal.sede || "",
    address: deal.address || "",
    status: deal.status || "open",
  });
  const [saving, setSaving] = useState(false);

  const handleChange =
    (key: keyof typeof local) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setLocal((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const handleSave = async () => {
    if (!onSaveDeal) return;
    setSaving(true);
    try {
      await onSaveDeal({
        sede: local.sede,
        address: local.address,
        status: local.status,
      });
    } finally {
      setSaving(false);
    }
  };

  const statusVariant = mapStatusToVariant(local.status);

  return (
    <Card className="shadow-sm">
      <Card.Body>
        <Row className="g-3 align-items-end">
          <Col md={6}>
            <div className="mb-1 text-muted">Cliente</div>
            <div className="fs-5 fw-semibold">
              {deal.organization?.name ?? "—"}
            </div>
            {!!deal.organization?.cif && (
              <div className="small text-muted">CIF: {deal.organization.cif}</div>
            )}
          </Col>

          <Col md={3}>
            <Form.Label className="mb-1">Sede</Form.Label>
            {readOnly ? (
              <div className="fw-medium">{deal.sede ?? "—"}</div>
            ) : (
              <Form.Control
                value={local.sede}
                onChange={handleChange("sede")}
                placeholder="Sede"
              />
            )}
          </Col>

          <Col md={3}>
            <Form.Label className="mb-1">Estado</Form.Label>
            {readOnly ? (
              <div>
                <Badge bg={statusVariant}>{deal.status ?? "—"}</Badge>
              </div>
            ) : (
              <Form.Select value={local.status} onChange={handleChange("status")}>
                <option value="open">open</option>
                <option value="scheduled">scheduled</option>
                <option value="won">won</option>
                <option value="lost">lost</option>
                <option value="draft">draft</option>
              </Form.Select>
            )}
          </Col>
        </Row>

        <Row className="g-3 mt-2">
          <Col md={9}>
            <Form.Label className="mb-1">Dirección</Form.Label>
            {readOnly ? (
              <div className="fw-medium">{deal.address ?? "—"}</div>
            ) : (
              <Form.Control
                value={local.address}
                onChange={handleChange("address")}
                placeholder="Dirección de la formación"
              />
            )}
          </Col>

          <Col md={3} className="d-flex align-items-end justify-content-end">
            {!readOnly && (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando..." : "Guardar"}
              </Button>
            )}
          </Col>
        </Row>
      </Card.Body>
    </Card>
  );
};

function mapStatusToVariant(status?: string) {
  switch ((status || "").toLowerCase()) {
    case "won":
      return "success";
    case "lost":
      return "danger";
    case "scheduled":
      return "info";
    case "draft":
      return "secondary";
    default:
      return "primary"; // open / default
  }
}
