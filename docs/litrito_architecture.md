# Arquitectura de Litrito

Litrito es un monolito modular TanStack Start con PostgreSQL 18. La API vive en
server functions/routes del mismo proceso web; no existe un servicio HTTP
separado. La ingestion es el único proceso aparte para aislar memoria.

## Hexagonal por dominio

Cada módulo en `src/features` separa:

- `domain`: modelos y reglas sin framework;
- `application`: DTOs, puertos y casos de uso;
- `infrastructure`: Drizzle/postgres.js, CNE y proveedores externos;
- `transport`: server functions y rutas HTTP;
- `react`: query options/hooks cuando el módulo tiene consumidores UI.

Los composition roots (`*.module.ts`) ensamblan adaptadores y casos de uso.
Las dependencias apuntan hacia el dominio/aplicación, no al revés.

## Persistencia y lecturas

Drizzle define las 18 tablas de aplicación y las cinco tablas Better Auth.
`pg_trgm` + `unaccent` respaldan búsqueda; los índices de latitud/longitud
resuelven nearby sin PostGIS por ahora. `station_listings`, caches de filtros y
métricas son read models reconstruidos después de cada carga nacional.

Las query keys históricas se conservaron para evitar churn en React Query,
aunque ya no representan suscripciones realtime.

## Ingestion

El worker Bun en `scripts/ingest` obtiene el catálogo CNE, crea tareas en
`ingestion_runs`, reclama lotes de 50 con `FOR UPDATE SKIP LOCKED` y aplica cada
municipio en una transacción acotada. Los padres se actualizan con agregaciones
SQL, eliminando la contención OCC. El XML de ubicaciones se procesa en lotes de
50 y se descarta; PostgreSQL conserva conteos, muestra y trazabilidad de la
corrida. `resume-stale` recupera tareas cada 15 min.

## Auth y comunidad

Better Auth usa el adapter Drizzle/PostgreSQL. Favoritos, eliminación de cuenta
y administración se exponen como server functions autenticadas. El worker purga
las cuentas vencidas después de los 15 días de gracia. Las fotos heredadas no
se sirven ni se copian: sólo se conservan sus metadatos por fidelidad del import.
