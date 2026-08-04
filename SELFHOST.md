# Self-host con Dokploy

El stack productivo contiene `web`, `postgres` e `ingestion`. No requiere un
servicio de objetos: las fotos heredadas y
los XML crudos se descartan después de transformar sus datos útiles.

1. Copia `.env.selfhost.example` y configura contraseñas, Better Auth, OAuth y
   SMTP en Dokploy.
2. Al desplegar, el servicio `migrate` aplica los esquemas de Drizzle y el
   servicio `ingestion` llena la base con datos vigentes de la CNE.
3. En Dokploy publica únicamente `web:3000` bajo el dominio de Litrito.
4. Despliega desde `docker-compose.dokploy.yml`.

El worker ejecuta la cola a las 00:15, 00:30, 01:00 y 02:00 UTC y recupera
tareas interrumpidas cada 15 minutos. Los respaldos quedan a cargo del backup
diario del VPS y, cuando se desee, de la función de respaldo del volumen
`postgres_data`.

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

Después del primer deploy, otorga el primer rol de administrador con:

```bash
DATABASE_URL=postgresql://... bun run admin:set --email=tu-correo@dominio
```
