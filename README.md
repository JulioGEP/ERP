# GEP Group · Planificación

ERP interno enfocado en la planificación de formaciones. Incluye la estructura base del frontend en React + TypeScript con Vite, estilos iniciales alineados con el branding de GEP Group, un calendario FullCalendar vacío y la vista de "Presupuestos" alimentada desde Pipedrive a través de una función serverless de Netlify.

## Tecnologías principales

- [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vitejs.dev/) como bundler
- [Bootstrap 5](https://getbootstrap.com/) y [React Bootstrap](https://react-bootstrap.netlify.app/) para componentes UI
- [FullCalendar](https://fullcalendar.io/) para la visualización del calendario
- [@tanstack/react-query](https://tanstack.com/query/latest) para la gestión de datos asincrónicos
- Netlify Functions para ocultar las credenciales y centralizar el acceso a Pipedrive

## Puesta en marcha

1. Instala las dependencias
   ```bash
   npm install
   ```
2. Define las variables de entorno necesarias (por ejemplo, en Netlify o un archivo `.env.local` si usas `netlify dev`):
   ```bash
   PIPEDRIVE_API_URL=https://api.pipedrive.com/v1
   PIPEDRIVE_API_TOKEN=TU_TOKEN
   ```
3. Levanta el entorno de desarrollo con Vite:
   ```bash
   npm run dev
   ```
4. Opcionalmente, ejecuta la función serverless en local con [`netlify dev`](https://docs.netlify.com/cli/get-started/) para evitar problemas de CORS.

## Despliegue en Netlify

El archivo [`netlify/functions/deals.ts`](netlify/functions/deals.ts) expone el endpoint `/.netlify/functions/deals`, que devuelve los presupuestos del embudo 3, resolviendo el campo personalizado de "Sede" y filtrando los productos cuyo código comienza por `form-`.

La configuración recomendada de Netlify es:

```toml
[build]
  command = "npm run build"
  publish = "dist"
  functions = "netlify/functions"
```

## Próximos pasos sugeridos

- Sincronizar eventos reales en el calendario a partir de las fechas planificadas.
- Permitir que los usuarios asignen fechas desde la vista de "Presupuestos" y reflejarlo en Pipedrive.
- Añadir filtros y búsqueda avanzada por cliente, sede o tipo de formación.
- Integrar progresivamente las APIs de Holded y WooCommerce.
- Incorporar la carga y gestión de documentación mediante Google Workspace.
