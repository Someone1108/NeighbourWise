const pool = require('../utils/db');

const LGA_ALIASES = {
  MORELAND: 'MERRI-BEK',
  'PORT OF MELBOURNE': 'MELBOURNE',
  'BAYSIDE (VIC.)': 'BAYSIDE',
  'KINGSTON (VIC.)': 'KINGSTON',
};

const VICTORIAN_PLANNING_LINKS = [
  {
    key: 'property-report',
    title: 'Planning Property Report',
    description: 'Victorian Government property planning report for zones, overlays and controls.',
    url: 'https://www.planning.vic.gov.au/planning-schemes/planning-property-report',
    source: 'Victorian Government',
  },
  {
    key: 'planning-schemes',
    title: 'Planning schemes',
    description: 'Browse Victorian planning schemes and local planning controls.',
    url: 'https://www.planning.vic.gov.au/planning-schemes',
    source: 'Victorian Government',
  },
  {
    key: 'scheme-amendments',
    title: 'Planning scheme amendments',
    description: 'Search Victorian planning scheme amendments, processes and current amendment information.',
    url: 'https://www.planning.vic.gov.au/planning-schemes/amendments',
    source: 'Victorian Government',
  },
];

function normalizeName(value) {
  return String(value || '').trim();
}

function normalizeKey(value) {
  const key = normalizeName(value).toUpperCase().replace(/\s+/g, ' ');
  return LGA_ALIASES[key] || key;
}

function normalizeCoordinate(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toTitleCase(value) {
  return normalizeName(value)
    .toLowerCase()
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function findLgaByCoordinates(lat, lng) {
  const safeLat = normalizeCoordinate(lat);
  const safeLng = normalizeCoordinate(lng);

  if (safeLat === null || safeLng === null) {
    return null;
  }

  const pointSql = `
    select z.lga
    from public.zoning_features z
    where z.lga is not null
      and trim(z.lga) <> ''
      and st_intersects(
        z.geom,
        st_setsrid(st_makepoint($1, $2), 4326)
      )
    order by st_area(z.geom::geography) asc
    limit 1;
  `;

  const pointResult = await pool.query(pointSql, [safeLng, safeLat]);
  if (pointResult.rows[0]?.lga) {
    return pointResult.rows[0].lga;
  }

  const nearestSql = `
    select z.lga
    from public.zoning_features z
    where z.lga is not null
      and trim(z.lga) <> ''
    order by z.geom <-> st_setsrid(st_makepoint($1, $2), 4326)
    limit 1;
  `;

  const nearestResult = await pool.query(nearestSql, [safeLng, safeLat]);
  return nearestResult.rows[0]?.lga || null;
}

async function findCouncilLinksByLga(lgaName) {
  const key = normalizeKey(lgaName);
  if (!key) return null;

  const sql = `
    select
      coverage_type,
      lga_name,
      council_name,
      home_url,
      projects_or_works_url,
      planning_url,
      strategies_or_plans_url,
      vicplan_property_report_url,
      victorian_planning_schemes_url,
      planning_scheme_amendments_dataset_url,
      last_checked,
      notes
    from public.council_links
    where upper(trim(lga_name)) = $1
    limit 1;
  `;

  const result = await pool.query(sql, [key]);
  return result.rows[0] || null;
}

function buildLinkItems(row) {
  const source = row?.council_name || row?.lga_name || 'Council';
  const items = [
    {
      key: 'projects',
      title: 'Council projects and works',
      description: 'Current and upcoming council projects, works, upgrades and local initiatives.',
      url: row?.projects_or_works_url,
      source,
    },
    {
      key: 'planning',
      title: 'Planning and building',
      description: 'Planning permits, building guidance, zoning information and local planning services.',
      url: row?.planning_url,
      source,
    },
    {
      key: 'strategies',
      title: 'Strategies and plans',
      description: 'Long-term council strategies, structure plans, policies and area planning documents.',
      url: row?.strategies_or_plans_url,
      source,
    },
    ...VICTORIAN_PLANNING_LINKS.map((item) => ({
      ...item,
      url: row?.[
        item.key === 'property-report'
          ? 'vicplan_property_report_url'
          : item.key === 'planning-schemes'
            ? 'victorian_planning_schemes_url'
            : 'planning_scheme_amendments_dataset_url'
      ] || item.url,
    })),
  ];

  return items.filter((item) => item.url);
}

async function fetchCouncilLinks({ lat, lng, lgaName }) {
  const requestedLga = normalizeName(lgaName);
  const resolvedLga = requestedLga || await findLgaByCoordinates(lat, lng);
  const councilLinks = await findCouncilLinksByLga(resolvedLga);

  if (!councilLinks) {
    return {
      available: false,
      lgaName: resolvedLga ? toTitleCase(resolvedLga) : null,
      councilName: null,
      links: VICTORIAN_PLANNING_LINKS,
      message: resolvedLga
        ? `Council-specific links are not available yet for ${toTitleCase(resolvedLga)}. Victorian planning sources are still available below.`
        : 'Council-specific links are not available for this location yet. Victorian planning sources are still available below.',
    };
  }

  return {
    available: true,
    coverageType: councilLinks.coverage_type,
    lgaName: councilLinks.lga_name,
    councilName: councilLinks.council_name,
    lastChecked: councilLinks.last_checked,
    notes: councilLinks.notes,
    links: buildLinkItems(councilLinks),
  };
}

module.exports = {
  fetchCouncilLinks,
};
