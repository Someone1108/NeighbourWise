
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


-- 6) crime_suburb_offences_clean
-- Cleaned row-level offence records from Melbourne recorded offences Table 03

create table if not exists public.crime_suburb_offences_clean (
    crime_id bigint primary key,
    year integer not null,
    year_ending text,
    local_government_area text,
    lga_key text,
    postcode text,
    suburb_town_name text,
    suburb_key text,
    offence_division text,
    offence_subdivision text,
    offence_subgroup text,
    offence_count integer
);

create index if not exists idx_crime_offences_year
    on public.crime_suburb_offences_clean (year);

create index if not exists idx_crime_offences_suburb_key
    on public.crime_suburb_offences_clean (suburb_key);

create index if not exists idx_crime_offences_postcode
    on public.crime_suburb_offences_clean (postcode);

create index if not exists idx_crime_offences_lga_key
    on public.crime_suburb_offences_clean (lga_key);

create index if not exists idx_crime_offences_subgroup
    on public.crime_suburb_offences_clean (offence_subgroup);


-- 7) crime_suburb_summary
-- Latest-year suburb-level crime context summary used by safety scoring

create table if not exists public.crime_suburb_summary (
    year integer not null,
    suburb_key text not null,
    postcode text,
    suburb_name text,
    lga_key text,
    lga_name text,
    total_offences integer,
    person_offences integer,
    property_offences integer,
    disorder_offences integer,
    other_offences integer,
    total_offence_percentile numeric(8,4),
    person_crime_percentile numeric(8,4),
    property_crime_percentile numeric(8,4),
    disorder_crime_percentile numeric(8,4),
    crime_context_score numeric(5,2),
    crime_context_label text,
    crime_context_summary text,
    crime_context_score_raw numeric(8,4),
    primary key (year, suburb_key, postcode)
);

create index if not exists idx_crime_summary_suburb_key
    on public.crime_suburb_summary (suburb_key);

create index if not exists idx_crime_summary_suburb_name
    on public.crime_suburb_summary (suburb_name);

create index if not exists idx_crime_summary_postcode
    on public.crime_suburb_summary (postcode);

create index if not exists idx_crime_summary_lga_key
    on public.crime_suburb_summary (lga_key);

create index if not exists idx_crime_summary_year
    on public.crime_suburb_summary (year);


-- 8) pet_friendly_spaces
-- Polygon dog park / pet-friendly park areas

create table if not exists public.pet_friendly_spaces (
    pet_id bigserial primary key,
    raw_id bigint,
    source_id text,
    access text default 'unknown',
    addr_housenumber text,
    addr_postcode text,
    addr_state text,
    addr_street text,
    addr_suburb text,
    area double precision,
    geom geometry(Polygon, 4326)
);

create index if not exists idx_pet_friendly_spaces_source_id
    on public.pet_friendly_spaces (source_id);

create index if not exists idx_pet_friendly_spaces_access
    on public.pet_friendly_spaces (access);

create index if not exists idx_pet_friendly_spaces_addr_suburb
    on public.pet_friendly_spaces (addr_suburb);

create index if not exists idx_pet_friendly_spaces_geom
    on public.pet_friendly_spaces
    using gist (geom);


-- 9) pet_friendly_spaces_points
-- Point dog park / pet-friendly park locations used for markers and nearest queries

create table if not exists public.pet_friendly_spaces_points (
    pet_point_id bigserial primary key,
    raw_id bigint,
    source_id text,
    access text default 'unknown',
    addr_housenumber text,
    addr_postcode text,
    addr_state text,
    addr_street text,
    addr_suburb text,
    geom geometry(Point, 4326)
);

create index if not exists idx_pet_friendly_spaces_points_source_id
    on public.pet_friendly_spaces_points (source_id);

create index if not exists idx_pet_friendly_spaces_points_access
    on public.pet_friendly_spaces_points (access);

create index if not exists idx_pet_friendly_spaces_points_addr_suburb
    on public.pet_friendly_spaces_points (addr_suburb);

create index if not exists idx_pet_friendly_spaces_points_geom
    on public.pet_friendly_spaces_points
    using gist (geom);


-- 10) Census profile tables
-- Processed 2021 Census profiles at SAL, SA2, and POA geography levels

create table if not exists public.census_sal_profile (
    sal_code_2021 text primary key,
    total_population integer,
    median_age numeric(6,2),
    median_household_income_weekly numeric(12,2),
    median_personal_income_weekly numeric(12,2),
    median_family_income_weekly numeric(12,2),
    median_rent_weekly numeric(12,2),
    median_mortgage_monthly numeric(12,2),
    average_household_size numeric(6,2),
    age_0_14_count integer,
    age_15_24_count integer,
    age_25_34_count integer,
    age_65_plus_count integer,
    age_0_14_pct numeric(8,4),
    age_15_24_pct numeric(8,4),
    age_25_34_pct numeric(8,4),
    age_65_plus_pct numeric(8,4),
    born_overseas_count integer,
    language_other_than_english_count integer,
    born_overseas_pct numeric(8,4),
    language_other_than_english_pct numeric(8,4),
    need_for_assistance_count integer,
    need_for_assistance_pct numeric(8,4),
    couple_family_with_children_count integer,
    one_parent_family_count integer,
    other_family_count integer,
    total_families integer,
    couple_family_with_children_pct numeric(8,4),
    one_parent_family_pct numeric(8,4),
    family_households_count integer,
    non_family_households_count integer,
    total_households integer,
    family_households_pct numeric(8,4),
    non_family_households_pct numeric(8,4),
    lone_person_households_count integer,
    group_households_count integer,
    lone_person_households_pct numeric(8,4),
    group_households_pct numeric(8,4),
    no_car_households_count integer,
    one_car_households_count integer,
    two_car_households_count integer,
    three_plus_car_households_count integer,
    car_households_total integer,
    no_car_households_pct numeric(8,4),
    two_plus_car_households_pct numeric(8,4),
    owned_outright_count integer,
    owned_with_mortgage_count integer,
    rented_count integer,
    tenure_total integer,
    owned_outright_pct numeric(8,4),
    owned_with_mortgage_pct numeric(8,4),
    renters_pct numeric(8,4),
    owner_occupied_pct numeric(8,4),
    train_to_work_count integer,
    bus_to_work_count integer,
    tram_to_work_count integer,
    car_driver_to_work_count integer,
    walk_to_work_count integer,
    worked_from_home_count integer,
    travel_to_work_total integer,
    public_transport_to_work_pct numeric(8,4),
    car_to_work_pct numeric(8,4),
    walk_to_work_pct numeric(8,4),
    worked_from_home_pct numeric(8,4),
    rent_to_income_ratio numeric(8,4)
);

create table if not exists public.census_sa2_profile (
    sa2_code_2021 text primary key,
    total_population integer,
    median_age numeric(6,2),
    median_household_income_weekly numeric(12,2),
    median_personal_income_weekly numeric(12,2),
    median_family_income_weekly numeric(12,2),
    median_rent_weekly numeric(12,2),
    median_mortgage_monthly numeric(12,2),
    average_household_size numeric(6,2),
    age_0_14_count integer,
    age_15_24_count integer,
    age_25_34_count integer,
    age_65_plus_count integer,
    age_0_14_pct numeric(8,4),
    age_15_24_pct numeric(8,4),
    age_25_34_pct numeric(8,4),
    age_65_plus_pct numeric(8,4),
    born_overseas_count integer,
    language_other_than_english_count integer,
    born_overseas_pct numeric(8,4),
    language_other_than_english_pct numeric(8,4),
    need_for_assistance_count integer,
    need_for_assistance_pct numeric(8,4),
    couple_family_with_children_count integer,
    one_parent_family_count integer,
    other_family_count integer,
    total_families integer,
    couple_family_with_children_pct numeric(8,4),
    one_parent_family_pct numeric(8,4),
    family_households_count integer,
    non_family_households_count integer,
    total_households integer,
    family_households_pct numeric(8,4),
    non_family_households_pct numeric(8,4),
    lone_person_households_count integer,
    group_households_count integer,
    lone_person_households_pct numeric(8,4),
    group_households_pct numeric(8,4),
    no_car_households_count integer,
    one_car_households_count integer,
    two_car_households_count integer,
    three_plus_car_households_count integer,
    car_households_total integer,
    no_car_households_pct numeric(8,4),
    two_plus_car_households_pct numeric(8,4),
    owned_outright_count integer,
    owned_with_mortgage_count integer,
    rented_count integer,
    tenure_total integer,
    owned_outright_pct numeric(8,4),
    owned_with_mortgage_pct numeric(8,4),
    renters_pct numeric(8,4),
    owner_occupied_pct numeric(8,4),
    train_to_work_count integer,
    bus_to_work_count integer,
    tram_to_work_count integer,
    car_driver_to_work_count integer,
    walk_to_work_count integer,
    worked_from_home_count integer,
    travel_to_work_total integer,
    public_transport_to_work_pct numeric(8,4),
    car_to_work_pct numeric(8,4),
    walk_to_work_pct numeric(8,4),
    worked_from_home_pct numeric(8,4),
    rent_to_income_ratio numeric(8,4)
);

create table if not exists public.census_poa_profile (
    poa_code_2021 text primary key,
    total_population integer,
    median_age numeric(6,2),
    median_household_income_weekly numeric(12,2),
    median_personal_income_weekly numeric(12,2),
    median_family_income_weekly numeric(12,2),
    median_rent_weekly numeric(12,2),
    median_mortgage_monthly numeric(12,2),
    average_household_size numeric(6,2),
    age_0_14_count integer,
    age_15_24_count integer,
    age_25_34_count integer,
    age_65_plus_count integer,
    age_0_14_pct numeric(8,4),
    age_15_24_pct numeric(8,4),
    age_25_34_pct numeric(8,4),
    age_65_plus_pct numeric(8,4),
    born_overseas_count integer,
    language_other_than_english_count integer,
    born_overseas_pct numeric(8,4),
    language_other_than_english_pct numeric(8,4),
    need_for_assistance_count integer,
    need_for_assistance_pct numeric(8,4),
    couple_family_with_children_count integer,
    one_parent_family_count integer,
    other_family_count integer,
    total_families integer,
    couple_family_with_children_pct numeric(8,4),
    one_parent_family_pct numeric(8,4),
    family_households_count integer,
    non_family_households_count integer,
    total_households integer,
    family_households_pct numeric(8,4),
    non_family_households_pct numeric(8,4),
    lone_person_households_count integer,
    group_households_count integer,
    lone_person_households_pct numeric(8,4),
    group_households_pct numeric(8,4),
    no_car_households_count integer,
    one_car_households_count integer,
    two_car_households_count integer,
    three_plus_car_households_count integer,
    car_households_total integer,
    no_car_households_pct numeric(8,4),
    two_plus_car_households_pct numeric(8,4),
    owned_outright_count integer,
    owned_with_mortgage_count integer,
    rented_count integer,
    tenure_total integer,
    owned_outright_pct numeric(8,4),
    owned_with_mortgage_pct numeric(8,4),
    renters_pct numeric(8,4),
    owner_occupied_pct numeric(8,4),
    train_to_work_count integer,
    bus_to_work_count integer,
    tram_to_work_count integer,
    car_driver_to_work_count integer,
    walk_to_work_count integer,
    worked_from_home_count integer,
    travel_to_work_total integer,
    public_transport_to_work_pct numeric(8,4),
    car_to_work_pct numeric(8,4),
    walk_to_work_pct numeric(8,4),
    worked_from_home_pct numeric(8,4),
    rent_to_income_ratio numeric(8,4)
);

create or replace view public.census_sa2_profile_valid as
select *
from public.census_sa2_profile
where total_population is not null
  and total_population > 0;

create or replace view public.census_sal_profile_valid as
select *
from public.census_sal_profile
where total_population is not null
  and total_population > 0;

create or replace view public.census_poa_profile_valid as
select *
from public.census_poa_profile
where total_population is not null
  and total_population > 0;


-- 11) Census lookup and crosswalk tables
-- Used to map searched suburbs/postcodes onto SA2 profile rows

create table if not exists public.sal_lookup (
    sal_code_2021 text primary key,
    sal_name_2021 text
);

create index if not exists idx_sal_lookup_name
    on public.sal_lookup (sal_name_2021);

create table if not exists public.sa2_lookup (
    sa2_code_2021 text primary key,
    sa2_name_2021 text
);

create index if not exists idx_sa2_lookup_name
    on public.sa2_lookup (sa2_name_2021);

create table if not exists public.poa_lookup (
    poa_code_2021 text primary key,
    postcode text,
    display_label text
);

create index if not exists idx_poa_lookup_postcode
    on public.poa_lookup (postcode);

create table if not exists public.sal_to_sa2 (
    sal_code_2021 text,
    sal_name_2021 text,
    sa2_code_2021 text,
    sa2_name_2021 text,
    overlap_area_pct numeric(8,4),
    confidence text,
    primary key (sal_code_2021, sa2_code_2021)
);

create index if not exists idx_sal_to_sa2_sal_name
    on public.sal_to_sa2 (sal_name_2021);

create index if not exists idx_sal_to_sa2_sa2_code
    on public.sal_to_sa2 (sa2_code_2021);

create index if not exists idx_sal_to_sa2_sa2_name
    on public.sal_to_sa2 (sa2_name_2021);

create table if not exists public.poa_to_sa2 (
    poa_code_2021 text,
    postcode text,
    sa2_code_2021 text,
    sa2_name_2021 text,
    overlap_area_pct numeric(8,4),
    confidence text,
    primary key (poa_code_2021, sa2_code_2021)
);

create index if not exists idx_poa_to_sa2_postcode
    on public.poa_to_sa2 (postcode);

create index if not exists idx_poa_to_sa2_sa2_code
    on public.poa_to_sa2 (sa2_code_2021);

create index if not exists idx_poa_to_sa2_sa2_name
    on public.poa_to_sa2 (sa2_name_2021);



-- Quick check view for geometry types
create or replace view public.spatial_table_summary as
select
    f_table_schema as schema_name,
    f_table_name   as table_name,
    f_geometry_column as geometry_column,
    type,
    srid
from public.geometry_columns;

