import React from "react";
import { ListGroup } from "react-bootstrap";

export interface Attachment {
  id?: string | number;
  name: string;
  url: string;
}

interface DealAttachmentsProps {
  attachments: Attachment[] | undefined | null;
}

/**
 * Muestra la lista de documentos de un deal (nombre + enlace de descarga).
 * UI: React-Bootstrap ListGroup
 */
const DealAttachments: React.FC<DealAttachmentsProps> = ({ attachments }) => {
  if (!attachments || attachments.length === 0) {
    return <p className="text-muted mb-0">Sin documentos adjuntos.</p>;
  }

  return (
    <ListGroup variant="flush">
      {attachments.map((att, idx) => {
        const key = att.id ?? `${att.url}-${idx}`;
        return (
          <ListGroup.Item
            key={key}
            className="d-flex justify-content-between align-items-center"
          >
            <span className="text-truncate me-3" title={att.name} style={{ maxWidth: "70%" }}>
              {att.name}
            </span>
            <a
              href={att.url}
              target="_blank"
              rel="noopener noreferrer"
              download
            >
              Descargar
            </a>
          </ListGroup.Item>
        );
      })}
    </ListGroup>
  );
};

export default DealAttachments;
