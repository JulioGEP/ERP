// src/components/deals/DealHeader.tsx
import React from "react";
import { Card, ListGroup } from "react-bootstrap";

export interface DealHeaderProps {
  deal: {
    title: string;
    orgName: string;
    sede: string;
    dealDirection: string;
    status: string;
  };
}

const DealHeader: React.FC<DealHeaderProps> = ({ deal }) => {
  return (
    <Card className="mb-3 shadow-sm">
      <Card.Header as="h5">{deal.title}</Card.Header>
      <ListGroup variant="flush">
        <ListGroup.Item>
          <strong>Cliente: </strong>
          {deal.orgName}
        </ListGroup.Item>
        <ListGroup.Item>
          <strong>Sede: </strong>
          {deal.sede}
        </ListGroup.Item>
        <ListGroup.Item>
          <strong>Dirección: </strong>
          {deal.dealDirection}
        </ListGroup.Item>
        <ListGroup.Item>
          <strong>Estado: </strong>
          {deal.status}
        </ListGroup.Item>
      </ListGroup>
    </Card>
  );
};

// 🔹 Ejemplo de uso directo dentro del mismo archivo
const DealHeaderExample: React.FC = () => {
  const sampleDeal = {
    title: "Formación Bombero de Empresa",
    orgName: "GEPCO Formación",
    sede: "Madrid",
    dealDirection: "Calle Mayor 123",
    status: "Ganado",
  };

  return <DealHeader deal={sampleDeal} />;
};

export default DealHeader;

// Si quieres ver el ejemplo renderizado, puedes exportar DealHeaderExample en vez de DealHeader:
// export default DealHeaderExample;
