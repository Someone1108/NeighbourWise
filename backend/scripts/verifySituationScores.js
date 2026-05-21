require('dotenv').config();

const pool = require('../src/utils/db');
const {
  findInsightRecommendations
} = require('../src/services/recommendationService');

async function verifyCounts() {
  const uploadedRuns = await pool.query(`
    select sr.persona, count(*)::int as rows
    from public.suburb_scores ss
    join public.score_runs sr
      on sr.id = ss.score_run_id
    where sr.id in (4, 5, 6, 7)
    group by sr.persona
    order by sr.persona;
  `);

  const latestView = await pool.query(
    `
      select persona, count(*)::int as rows
      from public.latest_suburb_scores
      where status = $1
      group by persona
      order by persona;
    `,
    ['completed']
  );

  console.log('Uploaded score runs:', uploadedRuns.rows);
  console.log('Latest view:', latestView.rows);
}

async function verifyRecommendations() {
  const sample = {
    lat: -37.8136,
    lng: 144.9631,
    rangeMinutes: 20
  };

  for (const profile of ['default', 'family', 'elderly', 'pet']) {
    const result = await findInsightRecommendations({
      ...sample,
      profile
    });

    console.log(
      `${profile}:`,
      JSON.stringify({
        currentSuburb: result.currentSuburb?.suburbName,
        currentScore: result.currentSuburb?.liveabilityScore,
        recommendations: (result.recommendations || []).map((item) => ({
          suburbName: item.suburbName,
          score: item.scores.liveability,
          persona: item.persona
        }))
      })
    );
  }
}

async function main() {
  await verifyCounts();
  await verifyRecommendations();
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exitCode = 1;
});
