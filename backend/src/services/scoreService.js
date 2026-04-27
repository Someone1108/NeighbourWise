// (D) final Liveability
// LiveabilityScore = Accessibility × w1 + Safety × w2 + Environment × w3

const { getAccessibilityScore } = require('./accessibilityScoreService');
const { getSafetyScore } = require('./safetyScoreService');
const { getEnvironmentScore } = require('./environmentScoreService');

const PERSONA_WEIGHTS = {
  default: { A: 0.4, S: 0.35, E: 0.25 },
  family: { A: 0.35, S: 0.4, E: 0.25 },
  elderly: { A: 0.45, S: 0.4, E: 0.15 },
  pet: { A: 0.3, S: 0.25, E: 0.45 }
};

const getLiveabilityScore = async ({
  lat,
  lng,
  time = 20,
  persona = 'default'
}) => {
  const [A, S, E] = await Promise.all([
    getAccessibilityScore({ lat, lng, time, persona }),
    getSafetyScore({ lat, lng, time, persona }),
    getEnvironmentScore({ lat, lng, time, persona })
  ]);

  const weights = PERSONA_WEIGHTS[persona] || PERSONA_WEIGHTS.default;

  const liveability =
    A.accessibilityScore * weights.A +
    S.safetyScore * weights.S +
    E.environmentScore * weights.E;

  return {
    liveabilityScore: Math.round(liveability * 100) / 100,
    time,
    persona,
    scores: {
      accessibility: A.accessibilityScore,
      safety: S.safetyScore,
      environment: E.environmentScore
    },
    weights,
    breakdown: {
      accessibility: A,
      safety: S,
      environment: E
    }
  };
};

module.exports = {
  getLiveabilityScore
};