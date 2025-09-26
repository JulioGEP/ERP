// src/components/deals/DealExtrasList.tsx

import React from "react";
import { Table } from "react-bootstrap";

type Product = {
  id: number | string;
  name: string;
  code?: string;
  quantity?: number;
  price?: number;
  isTraining?: boolean;
};

interface DealExtrasListProps {
  products: Product[];
}

const DealExtrasList: React.FC<DealExtrasListProps> = ({ products }) => {
  const extras = products.filter(
    (p) => !p.isTraining && !p.code?.startsWith("form-")
  );

  if (extras.length === 0) {
    return <p>No hay productos extra en este deal.</p>;
  }

  return (
    <Table striped bordered hover size="sm">
      <thead>
        <tr>
          <th>Producto</th>
          <th>Código</th>
          <th>Cantidad</th>
          <th>Precio</th>
        </tr>
      </thead>
      <tbody>
        {extras.map((prod) => (
          <tr key={prod.id}>
            <td>{prod.name}</td>
            <td>{prod.code || "-"}</td>
            <td>{prod.quantity ?? "-"}</td>
            <td>
              {prod.price !== undefined ? `${prod.price.toFixed(2)} €` : "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
};

export default DealExtrasList;
