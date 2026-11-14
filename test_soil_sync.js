const fs = require('fs');
const assert = require('assert');
const { getFarmProfileIntelligence } = require('./farm_profile_intelligence.js');

console.log('--- STARTING SOIL SYNC VERIFICATION BETWEEN FARM PROFILE & LAND REPORT ---');

// Load public/KRISHINITI.js in Node context with minimal mocks
const code = fs.readFileSync('public/KRISHINITI.js', 'utf8');

// Test 1: Samastipur, Bihar
async function testLocationSync(locationName, lat, lng) {
  console.log(`\nTesting location: ${locationName} (${lat}, ${lng})...`);
  
  // 1. Run Farm Profile Intelligence
  const profileIntelligence = await getFarmProfileIntelligence({ lat, lng });
  assert(profileIntelligence.soil, 'Profile intelligence must return soil');
  const probeSoil = profileIntelligence.soil;
  console.log(`Farm Profile Probe:`, {
    texture: probeSoil.textureClass,
    sand: probeSoil.sandPct,
    silt: probeSoil.siltPct,
    clay: probeSoil.clayPct,
    pH: probeSoil.pH,
    soc: probeSoil.organicCarbonPct,
    rootZone: probeSoil.rootZoneCapacityMm
  });

  // 2. Simulate Saved Profile from Farm Profile
  const profile = {
    savedAt: new Date().toISOString(),
    field: {
      center: { lat, lng },
      address: `${locationName} Farm`,
      calculatedAcres: 2.5
    },
    farm: {
      name: `${locationName} Test Field`,
      area: 2.5,
      areaUnit: 'acres',
      soilType: 'loamy',
      soilTest: 'no',
      water: 'moderate',
      waterSource: 'canal',
      priority: 'soil',
      crops: [{ year: '2024', value: 'rice' }],
      probedIntelligence: profileIntelligence
    }
  };

  // 3. Test buildUnifiedSoilBaseline behavior
  // Extract buildUnifiedSoilBaseline from KRISHINITI.js source
  const vm = require('vm');
  const sandbox = {
    console,
    latestFieldProbeData: profileIntelligence,
    labelFor: (type, val) => val,
    safeText: (s) => String(s || ''),
    document: { documentElement: { lang: 'en' } },
    $: (id) => null
  };
  vm.createContext(sandbox);

  // Run the definition
  const baselineCode = code.substring(
    code.indexOf('function buildUnifiedSoilBaseline'),
    code.indexOf('function getLandAnalysisData')
  );
  vm.runInContext(baselineCode, sandbox);

  const baseline = sandbox.buildUnifiedSoilBaseline(profile.farm, profile.field.center);
  console.log(`Land Report Unified Baseline:`, {
    texture: baseline.texture,
    sand: baseline.sand,
    silt: baseline.silt,
    clay: baseline.clay,
    pH: baseline.phVal,
    soc: baseline.ocVal,
    rootZone: baseline.rootZoneMm,
    isDemo: baseline.isDemonstration,
    provenance: baseline.provenance
  });

  // Assertions: Zero discrepancies!
  assert.strictEqual(baseline.isDemonstration, false, 'Land Report must not flag as DEMO DATA');
  assert.strictEqual(baseline.sand, probeSoil.sandPct, 'Sand percentage must match Farm Profile exactly');
  assert.strictEqual(baseline.silt, probeSoil.siltPct, 'Silt percentage must match Farm Profile exactly');
  assert.strictEqual(baseline.clay, probeSoil.clayPct, 'Clay percentage must match Farm Profile exactly');
  assert.strictEqual(baseline.phVal, probeSoil.pH, 'Soil pH must match Farm Profile exactly');
  assert.strictEqual(baseline.ocVal, probeSoil.organicCarbonPct, 'Organic Carbon must match Farm Profile exactly');
  assert.strictEqual(baseline.rootZoneMm, probeSoil.rootZoneCapacityMm, 'Root Zone bucket must match Farm Profile exactly');
  console.log(`✓ 100% telemetry synchronization verified for ${locationName}`);
}

// Test 2: Farmer Lab Soil Card Override Priority
async function testLabCardPriority() {
  console.log(`\nTesting Official Lab Soil Card Priority...`);
  const profileIntelligence = await getFarmProfileIntelligence({ lat: 25.86, lng: 85.78 });
  
  const profileWithLab = {
    savedAt: new Date().toISOString(),
    field: { center: { lat: 25.86, lng: 85.78 } },
    farm: {
      soilType: 'clay',
      soilTest: 'yes',
      labSoil: {
        ph: 7.4,
        soc: 0.85,
        n: 'high',
        p: 'medium',
        k: 'high'
      },
      probedIntelligence: profileIntelligence
    }
  };

  const vm = require('vm');
  const sandbox = {
    console,
    latestFieldProbeData: profileIntelligence,
    labelFor: (type, val) => val,
    safeText: (s) => String(s || ''),
    document: { documentElement: { lang: 'en' } }
  };
  vm.createContext(sandbox);

  const baselineCode = code.substring(
    code.indexOf('function buildUnifiedSoilBaseline'),
    code.indexOf('function getLandAnalysisData')
  );
  vm.runInContext(baselineCode, sandbox);

  const baseline = sandbox.buildUnifiedSoilBaseline(profileWithLab.farm, profileWithLab.field.center);
  
  assert.strictEqual(baseline.isLabCard, true, 'Must detect Lab Card');
  assert.strictEqual(baseline.phVal, 7.4, 'pH must use certified lab value 7.4');
  assert.strictEqual(baseline.ocVal, 0.85, 'SOC must use certified lab value 0.85%');
  assert.strictEqual(baseline.provenance, 'LAB_VERIFIED', 'Provenance must be LAB_VERIFIED');
  console.log(`✓ Certified Lab Card Priority verified: pH ${baseline.phVal}, SOC ${baseline.ocVal}%, Provenance: ${baseline.provenance}`);
}

async function run() {
  await testLocationSync('Samastipur, Bihar', 25.86, 85.78);
  await testLocationSync('Haldia, West Bengal', 22.06, 88.06);
  await testLocationSync('Jaipur, Rajasthan', 26.91, 75.78);
  await testLabCardPriority();
  console.log('\n===============================================================');
  console.log('ALL SOIL SYNCHRONIZATION TESTS PASSED WITH 100% ACCURACY!');
  console.log('===============================================================');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
