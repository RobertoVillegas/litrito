# Self-host con Dokploy

El stack productivo contiene `web`, `postgres`, `ingestion` y
`postgres-backup`. No requiere un servicio de objetos: las fotos heredadas y
los XML crudos se descartan después de transformar sus datos útiles.

1. Copia `.env.selfhost.example` y configura contraseñas, Better Auth, OAuth y
   SMTP en Dokploy.
2. Sube el snapshot a `/opt/litrito-migration/litrito-convex-export-20260801.zip`.
3. Desde el checkout de compose ejecuta el toolbox manual:

   ```bash
   docker compose -f docker-compose.dokploy.yml --profile tools run --rm --build migration bun run db:migrate
   docker compose -f docker-compose.dokploy.yml --profile tools run --rm migration bun run db:import-convex --snapshot=/migration/litrito-convex-export-20260801.zip --truncate
   docker compose -f docker-compose.dokploy.yml --profile tools run --rm migration bun run db:import-auth --snapshot=/migration/litrito-convex-export-20260801.zip
   ```

   Confirma los conteos antes de continuar. El perfil `tools` nunca arranca en
   un redeploy normal.
4. En Dokploy publica únicamente `web:3000` bajo el dominio de Litrito.
5. Despliega desde `docker-compose.dokploy.yml`.

El worker ejecuta la cola a las 00:15, 00:30, 01:00 y 02:00 UTC y recupera
tareas interrumpidas cada 15 minutos. PostgreSQL genera un `pg_dump` custom
diario y conserva siete días en `postgres_backups`.

No borres el volumen heredado hasta comparar las rutas públicas y conservar un
snapshot/export verificable fuera del repositorio.

## Cambio de variables en Dokploy

Conserva `APP_DOMAIN`, `VITE_UMAMI_*`, `SMTP_*`, `GOOGLE_*` y `FACEBOOK_*`.
Elimina `CONVEX_DOMAIN`, `CONVEX_HTTP_DOMAIN`, `DASHBOARD_DOMAIN`,
`VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `INSTANCE_NAME`, `INSTANCE_SECRET`,
`RUST_LOG` y `DOCUMENT_RETENTION_DELAY`.

Agrega `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `BETTER_AUTH_URL` y
un `BETTER_AUTH_SECRET` nuevo de al menos 32 bytes aleatorios. Las sesiones se
invalidan deliberadamente. `OVERPASS_URL` es opcional y sólo se usa al lanzar
una auditoría de marcas desde admin. No se requieren variables MinIO/S3.

Después de importar auth, otorga el primer rol de administrador con:

```bash
DATABASE_URL=postgresql://... bun run admin:set --email=tu-correo@dominio
```
