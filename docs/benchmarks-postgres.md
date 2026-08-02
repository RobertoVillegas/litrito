# Benchmarks PostgreSQL/PostGIS

Fecha: 1 de agosto de 2026.

## Objetivo

Validar que mover el cálculo geográfico a PostGIS corrige los límites previos de
1,000 candidatos en `bestNearby` y 4,000 en el orden por distancia sin degradar
la respuesta pública.

La comparación usa el dump real migrado (13,793 estaciones), PostgreSQL 18.4 +
PostGIS 3.6, 30 iteraciones calientes por escenario. El equipo local es ARM64 y
la imagen oficial se ejecutó bajo emulación AMD64, por lo que importan la
comparación relativa y el plan, no la latencia absoluta del VPS.

| Escenario | Radio | Haversine JS mediana / p95 | PostGIS mediana / p95 | Mismo top 10 |
| --- | ---: | ---: | ---: | --- |
| CDMX | 15 km | 3.40 / 6.01 ms | 3.47 / 5.34 ms | Sí |
| Guadalajara | 25 km | 3.04 / 4.23 ms | 3.02 / 3.71 ms | Sí |
| Monterrey | 50 km | 3.91 / 4.97 ms | 3.90 / 4.47 ms | Sí |
| Centro de México | 100 km | 1.80 / 2.91 ms | 1.79 / 2.44 ms | Sí |

`EXPLAIN (ANALYZE, BUFFERS)` confirmó un `Index Scan` sobre
`station_listings_geography_gist_idx`. En carga caliente, PostGIS queda entre
0.98x y 1.01x de la mediana anterior y mejora el p95 en los cuatro escenarios.
La ganancia principal es de exactitud: ya no se corta el conjunto antes de
calcular y ordenar distancias.

## Reproducir

Con una base PostGIS migrada:

```bash
DATABASE_URL=postgresql://... BENCH_ITERATIONS=30 bun run bench:geo
```

El script falla si PostGIS y el baseline Haversine sin límite no devuelven los
mismos permisos en el top 10.
