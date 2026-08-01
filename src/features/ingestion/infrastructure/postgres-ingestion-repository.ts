import type { IngestionRepository } from '../application/ports/ingestion-repository'
import type {
  ApplyPricesResult,
  Catalog,
  CnePlace,
  CneXmlSnapshot,
  MunicipalityPrice,
  MunicipalityTask,
} from '../domain/ingestion'
import { getDatabase } from '#/db/client'
import { rebuildReadCaches } from './rebuild-read-caches'

type ClaimedRow = {
  id: string
  parent_run_id: string
  state_external_id: string
  municipality_external_id: string
}

const newId = () => crypto.randomUUID()

export class PostgresIngestionRepository implements IngestionRepository {
  rebuildReadCaches() {
    return rebuildReadCaches()
  }
  async applyCatalog(catalog: Catalog) {
    const { sql } = getDatabase()
    await sql.begin(async (tx) => {
      for (const state of catalog.states) {
        await tx`
          insert into states (id, external_id, name, updated_at)
          values (${newId()}, ${state.externalId}, ${state.name}, now())
          on conflict (external_id) do update
          set name = excluded.name, updated_at = excluded.updated_at
        `
      }
      for (const municipality of catalog.municipalities) {
        await tx`
          insert into municipalities
            (id, external_id, state_external_id, name, updated_at)
          values
            (${newId()}, ${municipality.externalId}, ${municipality.stateExternalId}, ${municipality.name}, now())
          on conflict (state_external_id, external_id) do update
          set name = excluded.name, updated_at = excluded.updated_at
        `
      }
    })
  }

  async enqueueDailyRun(catalog: Catalog) {
    const { sql } = getDatabase()
    return sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(hashtext('litrito-daily-ingestion'))`
      const [existing] = await tx<{ id: string }[]>`
        select id from ingestion_runs
        where kind = 'daily_queue'
          and started_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
          and status in ('pending', 'running', 'success')
        order by started_at desc limit 1
        for update
      `
      if (existing) return null

      const runId = newId()
      await tx`
        insert into ingestion_runs
          (id, kind, status, started_at, records_read, records_written,
           failed_count, new_stations, heartbeat_at, message)
        values
          (${runId}, 'daily_queue', 'running', now(), ${catalog.municipalities.length},
           0, 0, 0, now(), ${`Carga nacional encolada en lotes de 50 para ${catalog.municipalities.length} municipios.`})
      `
      if (catalog.municipalities.length > 0) {
        const tasks = catalog.municipalities.map((municipality) => ({
          id: newId(),
          kind: 'municipality_prices',
          status: 'pending',
          started_at: new Date(),
          state_external_id: municipality.stateExternalId,
          municipality_external_id: municipality.externalId,
          parent_run_id: runId,
          records_read: 0,
          records_written: 0,
          failed_count: 0,
          new_stations: 0,
        }))
        await tx`insert into ingestion_runs ${tx(tasks)}`
      }
      return { runId, queued: catalog.municipalities.length }
    })
  }

  async claimMunicipalityBatch(limit: number): Promise<MunicipalityTask[]> {
    const { sql } = getDatabase()
    const rows = await sql<ClaimedRow[]>`
      with claimed as (
        select id from ingestion_runs
        where kind = 'municipality_prices' and status = 'pending'
        order by started_at, id
        for update skip locked
        limit ${limit}
      )
      update ingestion_runs as task
      set status = 'running', heartbeat_at = now()
      from claimed
      where task.id = claimed.id
      returning task.id, task.parent_run_id, task.state_external_id,
        task.municipality_external_id
    `
    return rows.map((row) => ({
      id: row.id,
      parentRunId: row.parent_run_id,
      stateExternalId: row.state_external_id,
      municipalityExternalId: row.municipality_external_id,
    }))
  }

  async applyMunicipalityPrices(
    task: MunicipalityTask,
    sourceUrl: string,
    rows: MunicipalityPrice[],
  ): Promise<ApplyPricesResult> {
    const { sql } = getDatabase()
    return sql.begin(async (tx) => {
      const [location] = await tx<{ state_name: string | null; municipality_name: string | null }[]>`
        select s.name as state_name, m.name as municipality_name
        from states s
        left join municipalities m on m.state_external_id = s.external_id
          and m.external_id = ${task.municipalityExternalId}
        where s.external_id = ${task.stateExternalId}
      `
      const stationRows = new Map(rows.map((row) => [row.permitNumber, row]))
      let newStations = 0
      let changed = 0

      for (const row of stationRows.values()) {
        const [inserted] = await tx<{ inserted: boolean }[]>`
          insert into stations
            (id, permit_number, name, address, state_external_id,
             municipality_external_id, state_name, municipality_name, source,
             first_seen_at, last_seen_at, coordinate_status)
          values
            (${newId()}, ${row.permitNumber}, ${row.name}, ${row.address},
             ${row.stateExternalId}, ${row.municipalityExternalId},
             ${location?.state_name ?? null}, ${location?.municipality_name ?? null},
             'CNE', now(), now(), 'pending')
          on conflict (permit_number) do update set
            name = excluded.name,
            address = excluded.address,
            state_external_id = excluded.state_external_id,
            municipality_external_id = excluded.municipality_external_id,
            state_name = excluded.state_name,
            municipality_name = excluded.municipality_name,
            last_seen_at = excluded.last_seen_at
          returning (xmax = 0) as inserted
        `
        if (inserted?.inserted) newStations += 1
      }

      for (const row of rows) {
        const [current] = await tx<{ price: number }[]>`
          select price from fuel_prices_current
          where station_permit_number = ${row.permitNumber}
            and subproduct = ${row.subproduct}
          for update
        `
        const priceChanged = !current || current.price !== row.price
        await tx`
          insert into fuel_prices_current
            (id, station_permit_number, product, subproduct, fuel_type, price,
             currency, unit, state_external_id, municipality_external_id,
             ingested_at, source)
          values
            (${newId()}, ${row.permitNumber}, ${row.product}, ${row.subproduct},
             ${row.fuelType}, ${row.price}, 'MXN', 'litro', ${row.stateExternalId},
             ${row.municipalityExternalId}, now(), 'CNE')
          on conflict (station_permit_number, subproduct) do update set
            product = excluded.product,
            fuel_type = excluded.fuel_type,
            price = excluded.price,
            state_external_id = excluded.state_external_id,
            municipality_external_id = excluded.municipality_external_id,
            ingested_at = excluded.ingested_at
        `
        if (priceChanged) {
          changed += 1
          await tx`
            insert into fuel_prices_history
              (id, station_permit_number, product, subproduct, fuel_type, price,
               currency, unit, state_external_id, municipality_external_id,
               ingested_at, source, run_id)
            values
              (${newId()}, ${row.permitNumber}, ${row.product}, ${row.subproduct},
               ${row.fuelType}, ${row.price}, 'MXN', 'litro', ${row.stateExternalId},
               ${row.municipalityExternalId}, now(), 'CNE', ${task.id})
          `
        }
      }

      for (const permitNumber of stationRows.keys()) {
        const [projection] = await tx<{
          station_id: string
          permit_number: string
          name: string
          address: string
          state_external_id: string
          municipality_external_id: string
          state_name: string | null
          municipality_name: string | null
          latitude: number | null
          longitude: number | null
          lat_bucket: number | null
          first_seen_at: Date
          prices: Record<string, { price: number; reportedAt?: string }>
          enrichment: { brand: string | null; displayName: string | null; source: string } | null
        }[]>`
          select s.id as station_id, s.permit_number, s.name, s.address,
            s.state_external_id, s.municipality_external_id, s.state_name,
            s.municipality_name, s.latitude, s.longitude, s.lat_bucket,
            s.first_seen_at,
            coalesce((
              select jsonb_object_agg(p.fuel_type, jsonb_build_object('price', p.price))
              from (
                select distinct on (fuel_type) fuel_type, price
                from fuel_prices_current
                where station_permit_number = s.permit_number
                order by fuel_type, ingested_at desc
              ) p
            ), '{}'::jsonb) as prices,
            case when e.id is null then null else jsonb_build_object(
              'brand', e.brand, 'displayName', e.display_name, 'source', e.source
            ) end as enrichment
          from stations s
          left join station_enrichment e on e.station_permit_number = s.permit_number
          where s.permit_number = ${permitNumber}
        `
        if (!projection) continue
        const price = (fuel: string) => projection.prices[fuel]?.price ?? null
        await tx`
          insert into station_listings
            (id, station_id, permit_number, name, address, state_external_id,
             municipality_external_id, state_name, municipality_name, latitude,
             longitude, lat_bucket, first_seen_at, regular_price, premium_price,
             diesel_price, duba_price, unknown_price, prices, enrichment, updated_at)
          values
            (${newId()}, ${projection.station_id}, ${projection.permit_number},
             ${projection.name}, ${projection.address}, ${projection.state_external_id},
             ${projection.municipality_external_id}, ${projection.state_name},
             ${projection.municipality_name}, ${projection.latitude},
             ${projection.longitude}, ${projection.lat_bucket}, ${projection.first_seen_at},
             ${price('regular')}, ${price('premium')}, ${price('diesel')},
             ${price('duba')}, ${price('unknown')}, ${JSON.stringify(projection.prices)}::jsonb,
             ${projection.enrichment ? JSON.stringify(projection.enrichment) : null}::jsonb, now())
          on conflict (permit_number) do update set
            station_id = excluded.station_id, name = excluded.name,
            address = excluded.address, state_external_id = excluded.state_external_id,
            municipality_external_id = excluded.municipality_external_id,
            state_name = excluded.state_name, municipality_name = excluded.municipality_name,
            latitude = excluded.latitude, longitude = excluded.longitude,
            lat_bucket = excluded.lat_bucket, first_seen_at = excluded.first_seen_at,
            regular_price = excluded.regular_price, premium_price = excluded.premium_price,
            diesel_price = excluded.diesel_price, duba_price = excluded.duba_price,
            unknown_price = excluded.unknown_price, prices = excluded.prices,
            enrichment = excluded.enrichment, updated_at = excluded.updated_at
        `
      }

      await tx`
        update ingestion_runs set status = ${rows.length ? 'success' : 'skipped'},
          finished_at = now(), source_url = ${sourceUrl}, records_read = ${rows.length},
          records_written = ${changed}, new_stations = ${newStations}, heartbeat_at = now(),
          message = ${rows.length ? `Procesados ${rows.length} precios; ${changed} cambiaron.` : 'Sin precios válidos.'}
        where id = ${task.id}
      `
      return { recordsWritten: changed, newStations }
    })
  }

  async failTask(task: MunicipalityTask, message: string) {
    const { sql } = getDatabase()
    await sql`
      update ingestion_runs set status = 'failed', finished_at = now(),
        heartbeat_at = now(), failed_count = 1, message = ${message.slice(0, 2_000)}
      where id = ${task.id}
    `
  }

  async finishParentRuns(parentIds: string[]) {
    if (parentIds.length === 0) return
    const { sql } = getDatabase()
    await sql`
      with totals as (
        select parent_run_id,
          count(*) filter (where status in ('pending', 'running'))::int as remaining,
          count(*) filter (where status = 'failed')::int as failed,
          count(*) filter (where status in ('success', 'skipped'))::int as completed,
          coalesce(sum(records_written), 0)::int as written,
          coalesce(sum(new_stations), 0)::int as new_stations
        from ingestion_runs
        where parent_run_id in ${sql(parentIds)}
        group by parent_run_id
      )
      update ingestion_runs parent set
        records_written = totals.completed,
        failed_count = totals.failed,
        new_stations = totals.new_stations,
        heartbeat_at = now(),
        status = case when totals.remaining > 0 then 'running'::ingestion_run_status
          when totals.failed = 0 then 'success'::ingestion_run_status
          when totals.completed = 0 then 'failed'::ingestion_run_status
          else 'partial_success'::ingestion_run_status end,
        finished_at = case when totals.remaining = 0 then now() else null end,
        message = format('Procesados %s municipios; %s fallaron; %s precios cambiaron.', totals.completed, totals.failed, totals.written)
      from totals where parent.id = totals.parent_run_id
    `
  }

  async resumeStaleTasks(staleAfterMinutes: number) {
    const { sql } = getDatabase()
    const rows = await sql<{ id: string }[]>`
      update ingestion_runs set status = 'pending', heartbeat_at = now(),
        message = 'Recuperada por resume-stale después de un worker interrumpido.'
      where kind = 'municipality_prices' and status = 'running'
        and heartbeat_at < now() - ${staleAfterMinutes} * interval '1 minute'
      returning id
    `
    return rows.length
  }

  async applyPlaces(places: CnePlace[], batchSize: number) {
    const { sql } = getDatabase()
    let matched = 0
    let updated = 0
    for (let offset = 0; offset < places.length; offset += batchSize) {
      const batch = places.slice(offset, offset + batchSize)
      await sql.begin(async (tx) => {
        for (const place of batch) {
          const [station] = await tx<{
            permit_number: string
            state_external_id: string
            municipality_external_id: string
            place_id: string | null
            latitude: number | null
            longitude: number | null
            lat_bucket: number | null
            coordinate_status: string | null
          }[]>`
            select permit_number, state_external_id, municipality_external_id,
              place_id, latitude, longitude, lat_bucket, coordinate_status
            from stations where permit_number = ${place.permitNumber}
          `
          if (!station) continue
          const [bounds] = await tx<{ sw_lat: number; sw_lon: number; ne_lat: number; ne_lon: number }[]>`
            select sw_lat, sw_lon, ne_lat, ne_lon from location_bounds
            where state_external_id = ${station.state_external_id}
              and (municipality_external_id = ${station.municipality_external_id}
                or municipality_external_id is null)
            order by municipality_external_id nulls last limit 1
          `
          const margin = 0.05
          const valid = !bounds || (
            place.latitude >= bounds.sw_lat - margin && place.latitude <= bounds.ne_lat + margin &&
            place.longitude >= bounds.sw_lon - margin && place.longitude <= bounds.ne_lon + margin
          )
          if (!valid) continue
          matched += 1
          const latBucket = Math.floor(place.latitude / 0.1)
          const changed = station.place_id !== place.placeId || station.latitude !== place.latitude ||
            station.longitude !== place.longitude || station.lat_bucket !== latBucket ||
            station.coordinate_status !== 'located'
          if (!changed) continue
          await tx`
            update stations set place_id = ${place.placeId}, latitude = ${place.latitude},
              longitude = ${place.longitude}, lat_bucket = ${latBucket},
              coordinate_status = 'located', coordinate_checked_at = now()
            where permit_number = ${place.permitNumber}
          `
          await tx`
            update station_listings set latitude = ${place.latitude},
              longitude = ${place.longitude}, lat_bucket = ${latBucket}, updated_at = now()
            where permit_number = ${place.permitNumber}
          `
          updated += 1
        }
      })
    }
    return { matched, updated }
  }

  async recordSnapshot(snapshot: CneXmlSnapshot) {
    const { sql } = getDatabase()
    const relevantCount = snapshot.kind === 'cne_places_xml' ? snapshot.placeCount : snapshot.priceCount
    const runId = newId()
    await sql.begin(async (tx) => {
      await tx`
        insert into ingestion_runs (id, kind, status, started_at, finished_at,
          source_url, records_read, records_written, message)
        values (${runId}, 'xml_snapshot', ${relevantCount > 0 ? 'success' : 'skipped'},
          now(), now(), ${snapshot.sourceUrl}, ${relevantCount}, 1,
          ${relevantCount > 0 ? 'XML procesado y descartado después de normalizarlo.' : 'XML sin registros válidos.'})
      `
      await tx`
        insert into raw_snapshots (id, kind, source_url, fetched_at, content_length,
          place_count, price_count, sample, object_key, run_id)
        values (${newId()}, ${snapshot.kind}, ${snapshot.sourceUrl}, now(),
          ${snapshot.contentLength}, ${snapshot.placeCount}, ${snapshot.priceCount},
          ${snapshot.sample}, null, ${runId})
      `
    })
  }

  async recordSnapshotFailure(kind: string, sourceUrl: string, message: string) {
    const { sql } = getDatabase()
    await sql`
      insert into ingestion_runs (id, kind, status, started_at, finished_at,
        source_url, records_read, records_written, failed_count, message)
      values (${newId()}, 'xml_snapshot', 'failed', now(), now(), ${sourceUrl},
        0, 0, 1, ${`${kind}: ${message}`.slice(0, 2_000)})
    `
  }

  async runMaintenance() {
    const { sql } = getDatabase()
    const accountsPurged = await sql.begin(async (tx) => {
      const due = await tx<{ auth_user_id: string }[]>`
        select auth_user_id from account_deletions where scheduled_at <= now() for update
      `
      const userIds = due.map((row) => row.auth_user_id)
      if (userIds.length === 0) return 0
      await tx`delete from station_favorites where user_id in ${tx(userIds)}`
      await tx`delete from user_roles where user_id in ${tx(userIds)}`
      await tx`delete from "user" where id in ${tx(userIds)}`
      await tx`delete from account_deletions where auth_user_id in ${tx(userIds)}`
      return userIds.length
    })
    const removed = await sql<{ id: string }[]>`
      delete from ingestion_runs
      where (kind = 'municipality_prices' and started_at < now() - interval '45 days')
         or (kind = 'daily_queue' and started_at < now() - interval '180 days')
      returning id
    `
    return { accountsPurged, runsPurged: removed.length }
  }
}
