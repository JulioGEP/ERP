# Pipedrive → Neon Sync

## Variables de entorno

- `PIPEDRIVE_BASE_URL`
- `PIPEDRIVE_API_TOKEN`
- `DATABASE_URL` (o `POSTGRES_URL` / `NEON_DATABASE_URL`)
- `DATABASE_SSL` (`true` para habilitar SSL; opcional, por defecto se activa para Neon)

## Comando

```bash
pnpm sync:deal --id 12345
```

## Orden de sincronización

1. Recupera el deal desde Pipedrive junto a su organización y persona.
2. Hace *upsert* de la organización y la persona en Neon.
3. Hace *upsert* del deal calculando `training`, `prod_extra` y campos personalizados.
4. Sincroniza notas y documentos asociados al deal.
5. Genera sesiones según los productos cuyo `code` contiene `form-`.
