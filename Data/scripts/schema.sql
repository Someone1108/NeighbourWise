
-- NeighbourWise / Supabase Postgres schema


-- Enable PostGIS
create extension if not exists postgis;

-- Optional: keep everything in public
set search_path to public;


-- 1) locality_point
-- Used for suburb/locality search suggestions and map centering

create table if not exists public.locality_point (
    id bigserial primary key,
    place_name text,
    placelabel text,
    postcode text,
    state text,
    latitude double precision,
    longitude double precision,
    geom geometry(Point, 4326)
);

create index if not exists idx_locality_point_place_name
    on public.locality_point (place_name);

create index if not exists idx_locality_point_placelabel
    on public.locality_point (placelabel);

create index if not exists idx_locality_point_geom
    on public.locality_point
    using gist (geom);

-- Keep lat/lng consistent with geom if geom is supplied
create or replace function public.sync_locality_point_latlng()
returns trigger as $$
begin
    if new.geom is not null then
        new.longitude := st_x(new.geom);
        new.latitude  := st_y(new.geom);
    elsif new.longitude is not null and new.latitude is not null then
        new.geom := st_setsrid(st_makepoint(new.longitude, new.latitude), 4326);
    end if;
    return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_locality_point_latlng on public.locality_point;

create trigger trg_sync_locality_point_latlng
before insert or update on public.locality_point
for each row
execute function public.sync_locality_point_latlng();


-- 2) locality_polygon
-- Used for official suburb boundaries

create table if not exists public.locality_polygon (
    id bigserial primary key,
    locality text,
    gazloc text,
    vicnamesid bigint,
    postcode text,
    geom geometry(MultiPolygon, 4326)
);

create index if not exists idx_locality_polygon_locality
    on public.locality_polygon (locality);

create index if not exists idx_locality_polygon_vicnamesid
    on public.locality_polygon (vicnamesid);

create index if not exists idx_locality_polygon_geom
    on public.locality_polygon
    using gist (geom);



-- 3) heat_features
-- Used for heat overlay / heat summaries

create table if not exists public.heat_features (
    id bigserial primary key,
    ogc_fid bigint,
    mb_code16 text,
    sa1_main16 text,
    sa2_name16 text,
    sa3_code16 text,
    sa3_name16 text,
    sa4_code16 text,
    lga text,
    uhi18_m double precision,
    geom geometry(MultiPolygon, 4326)
);

create index if not exists idx_heat_features_ogc_fid
    on public.heat_features (ogc_fid);

create index if not exists idx_heat_features_sa2_name16
    on public.heat_features (sa2_name16);

create index if not exists idx_heat_features_lga
    on public.heat_features (lga);

create index if not exists idx_heat_features_geom
    on public.heat_features
    using gist (geom);

-- 4) vegetation_features
-- Used for vegetation overlay / vegetation summaries

create table if not exists public.vegetation_features (
    id bigserial primary key,
    fid bigint,
    uniqueid text,
    mb_reclass text,
    type text,
    landtype text,
    areasqm double precision,
    areaanyveg double precision,
    peranyveg double precision,
    geom geometry(MultiPolygon, 4326)
);

create index if not exists idx_vegetation_features_fid
    on public.vegetation_features (fid);

create index if not exists idx_vegetation_features_uniqueid
    on public.vegetation_features (uniqueid);

create index if not exists idx_vegetation_features_type
    on public.vegetation_features (type);

create index if not exists idx_vegetation_features_geom
    on public.vegetation_features
    using gist (geom);



-- 5) zoning_features

create table if not exists public.zoning_features (
    id bigserial primary key,
    fid bigint,
    zone_code text,
    zone_name text,
    zone_group text,
    planning_scheme text,
    lga text,
    geom geometry(MultiPolygon, 4326)
);

create index if not exists idx_zoning_features_zone_code
    on public.zoning_features (zone_code);

create index if not exists idx_zoning_features_zone_name
    on public.zoning_features (zone_name);

create index if not exists idx_zoning_features_lga
    on public.zoning_features (lga);

create index if not exists idx_zoning_features_geom
    on public.zoning_features
    using gist (geom);




-- Quick check view for geometry types
create or replace view public.spatial_table_summary as
select
    f_table_schema as schema_name,
    f_table_name   as table_name,
    f_geometry_column as geometry_column,
    type,
    srid
from public.geometry_columns;

