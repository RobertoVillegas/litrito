# Litrito

Aplicación pública de precios de gasolina en México construida con TanStack
Start, React 19, Bun y PostgreSQL 18.

## Desarrollo

```bash
cp .env.example .env.local
docker compose up -d postgres
bun install
bun run db:migrate
bun run dev
```

Comandos principales:

```bash
bun run test
bun run type-check
bun run build
bun run db:generate
bun run ingest:enqueue
```

La aplicación usa módulos hexagonales por dominio bajo `src/features`: los
casos de uso dependen de puertos y PostgreSQL vive en infraestructura.
La ingestion diaria corre en un contenedor Bun separado y reclama municipios
con `FOR UPDATE SKIP LOCKED`.

Se mantiene fuera de Git cualquier snapshot o reporte con datos heredados. Los
JPEG heredados no se migraron porque la UI ya no usa fotos de estaciones;
`station_photos` conserva únicamente sus metadatos.
