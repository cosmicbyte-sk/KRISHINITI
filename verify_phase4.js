const assert = require('assert');
const path = require('path');
const fs = require('fs');

const { buildClimateActionPlan, generateRotationCandidates } = require('./action_plan');
const { analyzeClimateHistory } = require('./analytics_history');

console.log('--- RUNNING PHASE 4 VERIFICATION ---');

// 1. Verify rotation sequence generation rules
const candidates = generateRotationCandidates();
assert(candidates.length > 0, 'Rotation generator should produce candidates');
candidates.forEach(candidate => {
  assert(candidate.sequence.length === 2 || candidate.sequence.length === 3, 'Candidates should contain two or three seasons');
  assert(candidate.sequence.filter(id => id === 'lentils' || id === 'greengram').length <= 1, 'Candidates should include at most one legume');
  assert(candidate.sequence.every((id, index) => index === 0 || id !== candidate.sequence[index - 1]), 'Candidates should not repeat a crop consecutively');
});
console.log(`✓ Rotation candidates generated (${candidates.length} sequences verified for rules: 2-3 seasons, max 1 legume, no consecutive repeats)`);

// 2. Build synthetic daily history for 45 years to test rotation replay
const syntheticDaily = [];
for (let year = 1981; year <= 2025; year += 1) {
  const daysInYear = (year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)) ? 366 : 365;
  const onsetDoy = year <= 2020 ? 160 : 170;
  for (let day = 1; day <= daysInYear; day += 1) {
    const date = new Date(Date.UTC(year, 0, day)).toISOString().slice(0, 10);
    const dateMonth = Number(date.slice(5, 7)) - 1;
    const inRainSeason = [5, 6, 7, 8].includes(dateMonth);
    const rain = inRainSeason ? (day >= onsetDoy && day < onsetDoy + 10 ? 5 : 0.1) : 0;
    syntheticDaily.push({
      date,
      T2M: 24,
      T2M_MAX: 30,
      T2M_MIN: 18,
      PRECTOTCORR: rain,
      ALLSKY_SFC_SW_DWN: 18,
      RH2M: 60,
      WS2M: 2,
      GWETROOT: 0.5,
      GWETTOP: 0.4
    });
  }
}

const syntheticAnalysis = analyzeClimateHistory({
  status: 'live',
  source: 'NASA POWER mock',
  community: 'AG',
  coordinates: { lat: 25.86, lng: 85.78 },
  retrievedAt: '2026-01-01T00:00:00.000Z',
  period: { start: '1981-01-01', end: '2025-12-31' },
  missingPct: { T2M: 0, PRECTOTCORR: 0 },
  unavailableParameters: [],
  daily: syntheticDaily
});

const syntheticReplay = buildClimateActionPlan(
  { ...syntheticAnalysis, daily: syntheticDaily, status: 'live', missingPct: { PRECTOTCORR: 0, T2M_MAX: 0, T2M_MIN: 0, GWETROOT: 0 }, unavailableParameters: [] },
  syntheticAnalysis,
  [{ id: 'paddy', year: 2023 }, { id: 'wheat', year: 2024 }]
);

// 3. Verify replay evaluation constraints
assert.strictEqual(syntheticReplay.yearsEvaluated, 20, 'Replay should evaluate the latest 20 complete crop-years');
assert(syntheticReplay.rotations.length > 0, 'Replay should produce at least one candidate result');
assert(syntheticReplay.currentPractice, 'Replay should evaluate a recognizable two-crop current practice');
assert(syntheticReplay.rotations[0].survivedYears <= syntheticReplay.rotations[0].yearsEvaluated, 'Survival counts must not exceed replay years');
assert(syntheticReplay.method.waterBalance.includes('100 mm'), 'Replay must disclose its soil bucket assumption');
assert(syntheticReplay.method.waterBalance.includes('No supplemental irrigation is applied'), 'Replay must disclose its rainfed assumption');
assert.strictEqual(syntheticReplay.recommendations.length, 3, 'Action plan should include all three requested time horizons');

// 4. Verify the 3 time horizons
const horizons = syntheticReplay.recommendations.map(r => r.horizon);
assert(horizons.includes('This season'), 'Recommendations must include "This season"');
assert(horizons.includes('Next 3 seasons'), 'Recommendations must include "Next 3 seasons"');
assert(horizons.includes('By 2035'), 'Recommendations must include "By 2035"');

// 5. Verify quantitative proof & agronomics
syntheticReplay.recommendations.forEach(rec => {
  assert(rec.action, 'Each recommendation must state an action');
  assert(rec.confidence, 'Each recommendation must state confidence level');
  assert(rec.limits, 'Each recommendation must state documented limits');
});

// 6. Verify export capability in HTML/CSS
const html = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.action-plan.css'), 'utf8');
assert(html.includes('id="action-plan-export"'), 'Action plan must contain export button');
assert(css.includes('@media print'), 'CSS must include print stylesheet for export');

console.log('✓ Phase 4 Historical Replay & Data-Backed Action Plan verified with all 3 time horizons and export stylesheet!');
