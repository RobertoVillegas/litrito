CREATE EXTENSION IF NOT EXISTS postgis;
--> statement-breakpoint
CREATE INDEX "station_listings_geography_gist_idx" ON "station_listings" USING gist ((ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography)) WHERE "station_listings"."latitude" IS NOT NULL AND "station_listings"."longitude" IS NOT NULL;
