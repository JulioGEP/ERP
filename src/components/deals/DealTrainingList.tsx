// src/components/deals/DealTrainingList.tsx
import React from "react";
import { Table } from "react-bootstrap";

interface DealProduct {
  id: string | number;
  name: string;
  code?: string;
  quantity?: number;
  price?: number;
  isTraining?: boolean;
  [key: string]: any; // Por si vienen más campos desde la API
}

interface DealTrainingListProps {
  products: DealProduct[];
}

const DealTrainingList: React.FC<DealTrainingListProps> = ({ products }) => {
  // Filtramos solo productos de formación
  const trainingProducts = products.filter(
    (p) => p.isTraining || (p.code && p.code.startsWith("form-"))
  );

  if (trainingProducts.length === 0) {
    return <p className="text-muted">No hay formaciones en este deal.</p>;
  }

  return (
    <div>
      <h5>Formaciones incluidas</h5>
      <Table striped bordered hover size="sm" responsive>
        <thead>
          <tr>
            <th>Producto</th>
            <th>Código</th>
            <th>Cantidad</th>
            <th>Precio</th>
          </tr>
        </thead>
        <tbody>
          {trainingProducts.map((product) => (
            <tr key={product.id}>
              <td>{product.name}</td>
              <td>{product.code || "-"}</td>
              <td>{product.quantity || 1}</td>
              <td>
                {product.price !== undefined
                  ? `${product.price.toFixed(2)} €`
                  : "-"}
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
};

export default DealTrainingList;
