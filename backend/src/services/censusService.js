const pool = require('../utils/db');

const CENSUS_YEAR = 2021;

function toNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function round(value, digits = 1) {
  const n = toNumber(value);
  if (n === null) return null;
  const factor = 10 ** digits;
  return Math.round(n * factor) / factor;
}

function formatPct(value) {
  const n = round(value, 1);
  return n === null ? null : `${n}%`;
}

function formatCurrency(value, suffix = '') {
  const n = toNumber(value);
  if (n === null) return null;
  return `$${Math.round(n).toLocaleString('en-AU')}${suffix}`;
}

function normalizePlaceName(value) {
  return String(value || '')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\b(vic|victoria|australia)\b/gi, ' ')
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

function toTitleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase());
}

function buildSuburbSearchTerms(value) {
  const raw = String(value || '').trim();
  const cleaned = toTitleCase(normalizePlaceName(raw));
  const terms = [
    raw,
    cleaned,
    `${cleaned} (Vic.)`,
    `${cleaned} (VIC.)`,
    `${cleaned} (Victoria)`,
  ];

  return [...new Set(terms.filter(Boolean).map((term) => term.trim()))];
}

function buildParenthesizedPrefix(value) {
  const cleaned = toTitleCase(normalizePlaceName(value));
  return cleaned ? `${cleaned} (%` : null;
}

function pickProfile(row) {
  return {
    totalPopulation: toNumber(row.total_population),
    medianAge: toNumber(row.median_age),
    averageHouseholdSize: round(row.average_household_size, 1),
    totalHouseholds: toNumber(row.total_households),
    medianHouseholdIncomeWeekly: toNumber(row.median_household_income_weekly),
    medianRentWeekly: toNumber(row.median_rent_weekly),
    medianMortgageMonthly: toNumber(row.median_mortgage_monthly),
    rentToIncomeRatio: round(row.rent_to_income_ratio, 3),
    age0To14Pct: round(row.age_0_14_pct, 1),
    age15To24Pct: round(row.age_15_24_pct, 1),
    age25To34Pct: round(row.age_25_34_pct, 1),
    age65PlusPct: round(row.age_65_plus_pct, 1),
    bornOverseasPct: round(row.born_overseas_pct, 1),
    languageOtherThanEnglishPct: round(row.language_other_than_english_pct, 1),
    needForAssistancePct: round(row.need_for_assistance_pct, 1),
    coupleFamilyWithChildrenPct: round(row.couple_family_with_children_pct, 1),
    oneParentFamilyPct: round(row.one_parent_family_pct, 1),
    familyHouseholdsPct: round(row.family_households_pct, 1),
    lonePersonHouseholdsPct: round(row.lone_person_households_pct, 1),
    groupHouseholdsPct: round(row.group_households_pct, 1),
    noCarHouseholdsPct: round(row.no_car_households_pct, 1),
    twoPlusCarHouseholdsPct: round(row.two_plus_car_households_pct, 1),
    rentersPct: round(row.renters_pct, 1),
    ownerOccupiedPct: round(row.owner_occupied_pct, 1),
    publicTransportToWorkPct: round(row.public_transport_to_work_pct, 1),
    carToWorkPct: round(row.car_to_work_pct, 1),
    walkToWorkPct: round(row.walk_to_work_pct, 1),
    workedFromHomePct: round(row.worked_from_home_pct, 1),
  };
}

function buildInsights(row, locationLabel) {
  const area = locationLabel || row.sa2_name_2021 || 'this area';
  const rent = formatCurrency(row.median_rent_weekly, ' per week');
  const income = formatCurrency(row.median_household_income_weekly, ' per week');
  const mortgage = formatCurrency(row.median_mortgage_monthly, ' per month');

  return [
    {
      title: 'Household profile',
      text: `${area} has a median age of ${row.median_age ?? 'unknown'} and an average household size of ${round(row.average_household_size, 1) ?? 'unknown'} people. About ${formatPct(row.family_households_pct) ?? 'an unknown share of'} households are family households, with ${formatPct(row.couple_family_with_children_pct) ?? 'an unknown share'} recorded as couples with children.`,
    },
    {
      title: 'Rental and ownership context',
      text: `${formatPct(row.renters_pct) ?? 'An unknown share'} of households rent, while ${formatPct(row.owner_occupied_pct) ?? 'an unknown share'} are owner-occupied. The median rent is ${rent ?? 'not available'} and the median household income is ${income ?? 'not available'}.`,
    },
    {
      title: 'Older resident context',
      text: `${formatPct(row.age_65_plus_pct) ?? 'An unknown share'} of residents are aged 65 or over. ${formatPct(row.lone_person_households_pct) ?? 'An unknown share'} of households are lone-person households, which can make access to services, heat comfort, and local transport more important.`,
    },
    {
      title: 'Transport behaviour',
      text: `${formatPct(row.car_to_work_pct) ?? 'An unknown share'} of workers travel by car, compared with ${formatPct(row.public_transport_to_work_pct) ?? 'an unknown share'} using public transport. ${formatPct(row.no_car_households_pct) ?? 'An unknown share'} of households have no car.`,
    },
    {
      title: 'Community context',
      text: `${formatPct(row.born_overseas_pct) ?? 'An unknown share'} of residents were born overseas and ${formatPct(row.language_other_than_english_pct) ?? 'an unknown share'} speak a language other than English at home. This is shown as community context, not as a score.`,
    },
    {
      title: 'Housing costs',
      text: `The median monthly mortgage repayment is ${mortgage ?? 'not available'}. The rent-to-income ratio is ${round(row.rent_to_income_ratio, 2) ?? 'not available'}, which helps describe rental pressure but should be read alongside current market data.`,
    },
  ];
}

function shapeResult(row, requestedType, requestedValue, matchedBy) {
  if (!row) {
    return {
      available: false,
      requestedType,
      requestedValue,
      message: 'No Census profile was found for this location.',
    };
  }

  const locationLabel =
    row.matched_suburb ||
    row.postcode ||
    row.sa2_name_2021 ||
    requestedValue;

  return {
    available: true,
    dataYear: CENSUS_YEAR,
    requestedType,
    requestedValue,
    matchedBy,
    source: {
      geography: 'SA2',
      sa2Code: row.sa2_code_2021,
      sa2Name: row.sa2_name_2021,
      matchedSuburb: row.matched_suburb || null,
      postcode: row.postcode || null,
      overlapAreaPct: round(row.overlap_area_pct, 1),
      confidence: row.confidence || null,
    },
    profile: pickProfile(row),
    insights: buildInsights(row, locationLabel),
    limitations: [
      'Census data is from 2021 and is not live.',
      'Suburb and postcode boundaries do not always match SA2 boundaries exactly.',
    ],
  };
}

async function getCensusBySuburb(name) {
  const requestedName = String(name || '').trim();
  const searchTerms = buildSuburbSearchTerms(requestedName);
  const parenthesizedPrefix = buildParenthesizedPrefix(requestedName);

  if (!requestedName || searchTerms.length === 0) {
    throw new Error('Suburb name is required');
  }

  const sql = `
    select
      m.sal_name_2021 as matched_suburb,
      m.sa2_name_2021,
      m.overlap_area_pct,
      m.confidence,
      p.*
    from public.sal_to_sa2 m
    join public.census_sa2_profile_valid p
      on p.sa2_code_2021 = m.sa2_code_2021
    where upper(trim(m.sal_name_2021)) = any($2::text[])
       or upper(trim(m.sa2_name_2021)) = any($2::text[])
       or upper(trim(m.sal_name_2021)) like upper($3)
    order by
      case
        when upper(trim(m.sal_name_2021)) = upper($1) then 0
        when upper(trim(m.sal_name_2021)) = any($2::text[]) then 1
        when upper(trim(m.sa2_name_2021)) = upper($1) then 2
        when upper(trim(m.sal_name_2021)) like upper($3) then 3
        else 3
      end,
      m.overlap_area_pct desc nulls last
    limit 1;
  `;

  const result = await pool.query(sql, [
    requestedName,
    searchTerms.map((term) => term.toUpperCase()),
    parenthesizedPrefix,
  ]);
  return shapeResult(result.rows[0], 'suburb', requestedName, 'suburb-to-sa2');
}

async function getCensusByPostcode(postcode) {
  const value = String(postcode || '').trim();
  if (!/^\d{4}$/.test(value)) {
    throw new Error('A valid four-digit postcode is required');
  }

  const sql = `
    select
      m.postcode,
      m.sa2_name_2021,
      m.overlap_area_pct,
      m.confidence,
      p.*
    from public.poa_to_sa2 m
    join public.census_sa2_profile_valid p
      on p.sa2_code_2021 = m.sa2_code_2021
    where m.postcode = $1
    order by m.overlap_area_pct desc nulls last
    limit 1;
  `;

  const result = await pool.query(sql, [value]);
  return shapeResult(result.rows[0], 'postcode', value, 'postcode-to-sa2');
}

async function getCensusBySa2(code) {
  const value = String(code || '').trim();
  if (!value) {
    throw new Error('SA2 code is required');
  }

  const sql = `
    select
      l.sa2_name_2021,
      p.*
    from public.census_sa2_profile_valid p
    left join public.sa2_lookup l
      on l.sa2_code_2021 = p.sa2_code_2021
    where p.sa2_code_2021 = $1
    limit 1;
  `;

  const result = await pool.query(sql, [value]);
  return shapeResult(result.rows[0], 'sa2', value, 'sa2-code');
}

async function getSuburbForPoint(lat, lng) {
  const sql = `
    select "LOCALITY" as suburb
    from public.locality_polygon
    where st_intersects(
      geom,
      st_setsrid(st_makepoint($1, $2), 4326)
    )
    order by st_area(geom) asc
    limit 1;
  `;

  const result = await pool.query(sql, [lng, lat]);
  return result.rows[0]?.suburb || null;
}

async function getCensusByLocation({ lat, lng }) {
  const safeLat = Number(lat);
  const safeLng = Number(lng);

  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
    throw new Error('Valid latitude and longitude are required');
  }

  const suburb = await getSuburbForPoint(safeLat, safeLng);

  if (!suburb) {
    return {
      available: false,
      requestedType: 'location',
      requestedValue: `${safeLat},${safeLng}`,
      message: 'Could not match this point to a supported suburb.',
    };
  }

  const result = await getCensusBySuburb(suburb);
  return {
    ...result,
    requestedType: 'location',
    requestedValue: `${safeLat},${safeLng}`,
    matchedBy: 'address-point-to-suburb-to-sa2',
  };
}

module.exports = {
  getCensusBySuburb,
  getCensusByPostcode,
  getCensusBySa2,
  getCensusByLocation,
};
