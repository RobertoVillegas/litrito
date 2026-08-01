CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;--> statement-breakpoint
CREATE OR REPLACE FUNCTION immutable_unaccent(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
STRICT
AS 'SELECT public.unaccent(''public.unaccent'', value)';--> statement-breakpoint
CREATE TYPE "public"."admin_audit_action" AS ENUM('retry_municipality_prices', 'set_user_admin', 'scan_station_brands', 'review_station_brand');--> statement-breakpoint
CREATE TYPE "public"."admin_audit_status" AS ENUM('success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."brand_candidate_source" AS ENUM('osm', 'google_places', 'manual');--> statement-breakpoint
CREATE TYPE "public"."brand_confidence" AS ENUM('high', 'review', 'none');--> statement-breakpoint
CREATE TYPE "public"."brand_match_status" AS ENUM('accepted', 'review_nearby_not_accepted', 'no_match', 'manual_override', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."coordinate_status" AS ENUM('pending', 'located', 'failed');--> statement-breakpoint
CREATE TYPE "public"."enrichment_source" AS ENUM('overture', 'foursquare', 'osm', 'legal_name', 'manual');--> statement-breakpoint
CREATE TYPE "public"."fuel_type" AS ENUM('regular', 'premium', 'diesel', 'duba', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."ingestion_run_kind" AS ENUM('catalog', 'municipality_prices', 'xml_snapshot', 'daily_queue', 'geocoding');--> statement-breakpoint
CREATE TYPE "public"."ingestion_run_status" AS ENUM('running', 'success', 'failed', 'skipped', 'partial_success');--> statement-breakpoint
CREATE TYPE "public"."photo_status" AS ENUM('found', 'none');--> statement-breakpoint
CREATE TYPE "public"."snapshot_kind" AS ENUM('cne_prices_xml', 'cne_places_xml');--> statement-breakpoint
CREATE TABLE "account_deletions" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"auth_user_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"requested_at" timestamp with time zone NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"actor_user_id" text NOT NULL,
	"actor_email" text,
	"action" "admin_audit_action" NOT NULL,
	"target" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"status" "admin_audit_status" NOT NULL,
	"message" text,
	"run_id" text
);
--> statement-breakpoint
CREATE TABLE "filter_options_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_prices_current" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"station_permit_number" text NOT NULL,
	"product" text NOT NULL,
	"subproduct" text NOT NULL,
	"fuel_type" "fuel_type" NOT NULL,
	"price" double precision NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"unit" text DEFAULT 'litro' NOT NULL,
	"state_external_id" text NOT NULL,
	"municipality_external_id" text NOT NULL,
	"reported_at" timestamp with time zone,
	"ingested_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'CNE' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_prices_history" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"station_permit_number" text NOT NULL,
	"product" text NOT NULL,
	"subproduct" text NOT NULL,
	"fuel_type" "fuel_type" NOT NULL,
	"price" double precision NOT NULL,
	"currency" text DEFAULT 'MXN' NOT NULL,
	"unit" text DEFAULT 'litro' NOT NULL,
	"state_external_id" text NOT NULL,
	"municipality_external_id" text NOT NULL,
	"reported_at" timestamp with time zone,
	"ingested_at" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'CNE' NOT NULL,
	"run_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"kind" "ingestion_run_kind" NOT NULL,
	"status" "ingestion_run_status" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"state_external_id" text,
	"municipality_external_id" text,
	"source_url" text,
	"message" text,
	"records_read" integer,
	"records_written" integer,
	"parent_run_id" text,
	"cursor" text,
	"failed_count" integer,
	"new_stations" integer,
	"heartbeat_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "location_bounds" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"key" text NOT NULL,
	"state_external_id" text NOT NULL,
	"municipality_external_id" text,
	"sw_lat" double precision NOT NULL,
	"sw_lon" double precision NOT NULL,
	"ne_lat" double precision NOT NULL,
	"ne_lon" double precision NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics_cache" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"key" text NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "municipalities" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"external_id" text NOT NULL,
	"state_external_id" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"kind" "snapshot_kind" NOT NULL,
	"source_url" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"content_length" integer NOT NULL,
	"place_count" integer NOT NULL,
	"price_count" integer NOT NULL,
	"sample" text NOT NULL,
	"object_key" text,
	"run_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "states" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_brand_audits" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"station_permit_number" text NOT NULL,
	"station_name" text NOT NULL,
	"station_address" text NOT NULL,
	"state_external_id" text NOT NULL,
	"municipality_external_id" text NOT NULL,
	"state_name" text,
	"municipality_name" text,
	"station_latitude" double precision,
	"station_longitude" double precision,
	"candidate_source" "brand_candidate_source" NOT NULL,
	"candidate_id" text,
	"candidate_name" text,
	"candidate_brand" text,
	"candidate_operator" text,
	"candidate_latitude" double precision,
	"candidate_longitude" double precision,
	"candidate_distance_meters" double precision,
	"match_status" "brand_match_status" NOT NULL,
	"accepted_brand" text,
	"confidence" "brand_confidence" NOT NULL,
	"notes" text,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"scanned_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_enrichment" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"station_permit_number" text NOT NULL,
	"brand" text,
	"display_name" text,
	"source" "enrichment_source" NOT NULL,
	"source_release" text,
	"source_id" text,
	"source_name" text,
	"match_distance_meters" double precision,
	"enriched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_favorites" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"user_id" text NOT NULL,
	"station_permit_number" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_listings" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"station_id" text NOT NULL,
	"permit_number" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"state_external_id" text NOT NULL,
	"municipality_external_id" text NOT NULL,
	"state_name" text,
	"municipality_name" text,
	"latitude" double precision,
	"longitude" double precision,
	"lat_bucket" integer,
	"first_seen_at" timestamp with time zone NOT NULL,
	"regular_price" double precision,
	"premium_price" double precision,
	"diesel_price" double precision,
	"duba_price" double precision,
	"unknown_price" double precision,
	"prices" jsonb NOT NULL,
	"enrichment" jsonb,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station_photos" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"station_permit_number" text NOT NULL,
	"source" text DEFAULT 'mapillary' NOT NULL,
	"status" "photo_status" NOT NULL,
	"object_key" text,
	"legacy_storage_id" text,
	"mapillary_image_id" text,
	"attribution" text,
	"captured_at" timestamp with time zone,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"place_id" text,
	"permit_number" text NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"state_external_id" text NOT NULL,
	"municipality_external_id" text NOT NULL,
	"state_name" text,
	"municipality_name" text,
	"latitude" double precision,
	"longitude" double precision,
	"lat_bucket" integer,
	"coordinate_status" "coordinate_status",
	"coordinate_checked_at" timestamp with time zone,
	"source" text DEFAULT 'CNE' NOT NULL,
	"first_seen_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"id" text PRIMARY KEY NOT NULL,
	"convex_creation_time" double precision DEFAULT extract(epoch from clock_timestamp()) * 1000 NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"is_admin" boolean NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "account_deletions_user_uidx" ON "account_deletions" USING btree ("auth_user_id");--> statement-breakpoint
CREATE INDEX "account_deletions_scheduled_idx" ON "account_deletions" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "admin_audit_events_created_at_idx" ON "admin_audit_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "admin_audit_events_actor_idx" ON "admin_audit_events" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "filter_options_cache_key_uidx" ON "filter_options_cache" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "fuel_prices_current_station_subproduct_uidx" ON "fuel_prices_current" USING btree ("station_permit_number","subproduct");--> statement-breakpoint
CREATE INDEX "fuel_prices_current_station_fuel_idx" ON "fuel_prices_current" USING btree ("station_permit_number","fuel_type");--> statement-breakpoint
CREATE INDEX "fuel_prices_current_fuel_price_idx" ON "fuel_prices_current" USING btree ("fuel_type","price");--> statement-breakpoint
CREATE INDEX "fuel_prices_current_state_fuel_price_idx" ON "fuel_prices_current" USING btree ("state_external_id","fuel_type","price");--> statement-breakpoint
CREATE INDEX "fuel_prices_current_location_fuel_price_idx" ON "fuel_prices_current" USING btree ("state_external_id","municipality_external_id","fuel_type","price");--> statement-breakpoint
CREATE INDEX "fuel_prices_history_station_ingested_idx" ON "fuel_prices_history" USING btree ("station_permit_number","ingested_at");--> statement-breakpoint
CREATE INDEX "fuel_prices_history_run_idx" ON "fuel_prices_history" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "ingestion_runs_kind_started_idx" ON "ingestion_runs" USING btree ("kind","started_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_kind_status_started_idx" ON "ingestion_runs" USING btree ("kind","status","started_at");--> statement-breakpoint
CREATE INDEX "ingestion_runs_parent_idx" ON "ingestion_runs" USING btree ("parent_run_id");--> statement-breakpoint
CREATE INDEX "ingestion_runs_location_idx" ON "ingestion_runs" USING btree ("state_external_id","municipality_external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_bounds_key_uidx" ON "location_bounds" USING btree ("key");--> statement-breakpoint
CREATE INDEX "location_bounds_state_idx" ON "location_bounds" USING btree ("state_external_id");--> statement-breakpoint
CREATE UNIQUE INDEX "metrics_cache_key_uidx" ON "metrics_cache" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "municipalities_state_external_id_uidx" ON "municipalities" USING btree ("state_external_id","external_id");--> statement-breakpoint
CREATE INDEX "municipalities_state_idx" ON "municipalities" USING btree ("state_external_id");--> statement-breakpoint
CREATE INDEX "raw_snapshots_fetched_at_idx" ON "raw_snapshots" USING btree ("fetched_at");--> statement-breakpoint
CREATE UNIQUE INDEX "states_external_id_uidx" ON "states" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "station_brand_audits_station_idx" ON "station_brand_audits" USING btree ("station_permit_number");--> statement-breakpoint
CREATE INDEX "station_brand_audits_location_idx" ON "station_brand_audits" USING btree ("state_external_id","municipality_external_id");--> statement-breakpoint
CREATE INDEX "station_brand_audits_status_idx" ON "station_brand_audits" USING btree ("match_status");--> statement-breakpoint
CREATE INDEX "station_brand_audits_updated_at_idx" ON "station_brand_audits" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "station_enrichment_station_uidx" ON "station_enrichment" USING btree ("station_permit_number");--> statement-breakpoint
CREATE INDEX "station_enrichment_brand_idx" ON "station_enrichment" USING btree ("brand");--> statement-breakpoint
CREATE INDEX "station_favorites_user_idx" ON "station_favorites" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "station_favorites_user_station_uidx" ON "station_favorites" USING btree ("user_id","station_permit_number");--> statement-breakpoint
CREATE UNIQUE INDEX "station_listings_permit_uidx" ON "station_listings" USING btree ("permit_number");--> statement-breakpoint
CREATE INDEX "station_listings_location_idx" ON "station_listings" USING btree ("state_external_id","municipality_external_id");--> statement-breakpoint
CREATE INDEX "station_listings_state_idx" ON "station_listings" USING btree ("state_external_id");--> statement-breakpoint
CREATE INDEX "station_listings_lat_bucket_longitude_idx" ON "station_listings" USING btree ("lat_bucket","longitude");--> statement-breakpoint
CREATE INDEX "station_listings_regular_price_idx" ON "station_listings" USING btree ("regular_price");--> statement-breakpoint
CREATE INDEX "station_listings_premium_price_idx" ON "station_listings" USING btree ("premium_price");--> statement-breakpoint
CREATE INDEX "station_listings_diesel_price_idx" ON "station_listings" USING btree ("diesel_price");--> statement-breakpoint
CREATE INDEX "station_listings_duba_price_idx" ON "station_listings" USING btree ("duba_price");--> statement-breakpoint
CREATE INDEX "station_listings_unknown_price_idx" ON "station_listings" USING btree ("unknown_price");--> statement-breakpoint
CREATE INDEX "station_listings_state_regular_price_idx" ON "station_listings" USING btree ("state_external_id","regular_price");--> statement-breakpoint
CREATE INDEX "station_listings_state_premium_price_idx" ON "station_listings" USING btree ("state_external_id","premium_price");--> statement-breakpoint
CREATE INDEX "station_listings_state_diesel_price_idx" ON "station_listings" USING btree ("state_external_id","diesel_price");--> statement-breakpoint
CREATE INDEX "station_listings_state_duba_price_idx" ON "station_listings" USING btree ("state_external_id","duba_price");--> statement-breakpoint
CREATE INDEX "station_listings_state_unknown_price_idx" ON "station_listings" USING btree ("state_external_id","unknown_price");--> statement-breakpoint
CREATE INDEX "station_listings_location_regular_price_idx" ON "station_listings" USING btree ("state_external_id","municipality_external_id","regular_price");--> statement-breakpoint
CREATE INDEX "station_listings_location_premium_price_idx" ON "station_listings" USING btree ("state_external_id","municipality_external_id","premium_price");--> statement-breakpoint
CREATE INDEX "station_listings_location_diesel_price_idx" ON "station_listings" USING btree ("state_external_id","municipality_external_id","diesel_price");--> statement-breakpoint
CREATE INDEX "station_listings_location_duba_price_idx" ON "station_listings" USING btree ("state_external_id","municipality_external_id","duba_price");--> statement-breakpoint
CREATE INDEX "station_listings_location_unknown_price_idx" ON "station_listings" USING btree ("state_external_id","municipality_external_id","unknown_price");--> statement-breakpoint
CREATE INDEX "station_listings_search_trgm_idx" ON "station_listings" USING gin (immutable_unaccent("name" || ' ' || "permit_number" || ' ' || "address") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "station_photos_station_uidx" ON "station_photos" USING btree ("station_permit_number");--> statement-breakpoint
CREATE UNIQUE INDEX "stations_permit_number_uidx" ON "stations" USING btree ("permit_number");--> statement-breakpoint
CREATE INDEX "stations_location_idx" ON "stations" USING btree ("state_external_id","municipality_external_id");--> statement-breakpoint
CREATE INDEX "stations_state_idx" ON "stations" USING btree ("state_external_id");--> statement-breakpoint
CREATE INDEX "stations_latitude_idx" ON "stations" USING btree ("latitude");--> statement-breakpoint
CREATE INDEX "stations_lat_bucket_longitude_idx" ON "stations" USING btree ("lat_bucket","longitude");--> statement-breakpoint
CREATE INDEX "stations_coordinate_status_checked_idx" ON "stations" USING btree ("coordinate_status","coordinate_checked_at");--> statement-breakpoint
CREATE INDEX "stations_search_trgm_idx" ON "stations" USING gin (immutable_unaccent("name" || ' ' || "permit_number" || ' ' || "address") gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_user_id_uidx" ON "user_roles" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_roles_email_uidx" ON "user_roles" USING btree ("email");
