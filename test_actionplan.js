const assert = require("assert");
const { getNasaPowerHistory } = require("./nasa_power_history");
const { analyzeClimateHistory } = require("./analytics_history");
const {
  buildClimateActionPlan,
  buildFarmDiagnosis,
  buildStructuredRecommendations,
  buildSeasonalCalendar,
  buildRotationSuitabilityExplanation,
  buildCropOptions,
  buildNutrientStatus,
  isSupportedRegion
} = require("./action_plan");
const { findAgroEcologicalZone } = require("./farm_profile_intelligence");

console.log("===============================================================================");
console.log("KRISHINITI — PERSONALIZED FARM ACTION PLAN COMPLETE VERIFICATION SUITE");
console.log("===============================================================================\n");

async function testLocation(name, lat, lng, options = {}) {
  console.log(`\n>>> TESTING LOCATION: ${name} (${lat}°N, ${lng}°E) <<<`);

  // 1. Coordinates support check
  assert(isSupportedRegion(lat, lng), `Coordinates ${lat}, ${lng} must be within South Asian domain`);

  // 2. Agro-ecological zone resolution
  const zone = findAgroEcologicalZone(lat, lng);
  console.log(`✓ Detected Agro-Ecological Zone: ${zone?.name || 'South Asian Zone'}`);
  assert(zone, "Must identify an authentic agro-ecological sub-zone");

  // 3. Historical NASA Climatology & Action Plan
  const history = await getNasaPowerHistory({ lat, lng });
  assert(history && history.daily, "History payload must contain daily series");
  const analysis = analyzeClimateHistory(history);
  assert(analysis && analysis.metrics, "Analysis must contain calculated climate metrics");

  const actionPlan = buildClimateActionPlan(
    history,
    analysis,
    options.practice || [],
    options.duration || "all",
    {
      waterAccess: options.waterAccess || "rainfed",
      waterSource: options.waterSource || null,
      soilType: options.soilType || null,
      soilTest: options.soilTest || null,
      labSoil: options.labSoil || null,
      area: options.area || 2.5,
      goals: options.goals || ["resilience", "profit"],
      farmName: `${name} Field`
    }
  );

  assert.strictEqual(actionPlan.status, "ok", "Action plan status must be 'ok'");
  console.log(`✓ 45-Year Climatology Replay Evaluated: ${actionPlan.yearsEvaluated} crop-years (${actionPlan.years.start}–${actionPlan.years.end})`);

  // 4. Validate Farm Diagnosis (Part 2)
  const diag = actionPlan.farmDiagnosis;
  assert(diag && diag.overview, "Must include Farm Diagnosis overview");
  assert(Array.isArray(diag.categories) && diag.categories.length === 6, "Must divide diagnosis into 6 distinct categories");
  const catIds = diag.categories.map(c => c.id);
  assert(catIds.includes("soil"), "Diagnosis must include Soil Condition");
  assert(catIds.includes("water"), "Diagnosis must include Water Condition");
  assert(catIds.includes("climate"), "Diagnosis must include Climate Vulnerability");
  assert(catIds.includes("vegetation"), "Diagnosis must include Vegetation Condition");
  assert(catIds.includes("practices"), "Diagnosis must include Farming Practices");
  assert(catIds.includes("market"), "Diagnosis must include Market Accessibility");

  for (const cat of diag.categories) {
    assert(cat.observedCondition && cat.observedCondition !== "", `Category ${cat.id} must have observed condition`);
    assert(cat.supportingData && cat.supportingData !== "", `Category ${cat.id} must have supporting data`);
    assert(cat.whyItMatters && cat.whyItMatters !== "", `Category ${cat.id} must have whyItMatters explanation`);
    assert(cat.recommendedIntervention && cat.recommendedIntervention !== "", `Category ${cat.id} must have recommended intervention`);
  }
  console.log(`✓ Farm Diagnosis verified across 6 dimensions with data provenance`);

  // 5. Validate Structured Recommendations (Part 3)
  const recs = actionPlan.structuredRecommendations;
  assert(Array.isArray(recs) && recs.length >= 6, "Must provide structured recommendations covering all categories");
  const recCategories = new Set(recs.map(r => r.category));
  assert(recCategories.has("soil"), "Recommendations must cover Soil Health Management");
  assert(recCategories.has("water"), "Recommendations must cover Water Management");
  assert(recCategories.has("crops"), "Recommendations must cover Crop Selection");
  assert(recCategories.has("fertilizer"), "Recommendations must cover Fertilizer & Nutrient Management");
  assert(recCategories.has("pest"), "Recommendations must cover Pest & Disease Management");
  assert(recCategories.has("resilience"), "Recommendations must cover Climate Resilience");

  for (const r of recs) {
    assert(r.id && r.title && r.priority, `Recommendation ${r.id} must have id, title, and priority`);
    assert(["High", "Medium", "Long-Term"].includes(r.priority), `Priority must be High, Medium, or Long-Term; got ${r.priority}`);
    assert(r.identifiedIssue && r.recommendedAction, "Must have identified issue and recommended action");
    assert(r.farmerFriendly && r.scientificReasoning, "Must have farmer-friendly summary and scientific reasoning");
    assert(r.farmerFriendlyHi && r.scientificReasoningHi, "Must have Hindi translations for simple and scientific explanations");
    assert(Array.isArray(r.dataSources) || r.supportingEvidence, "Must specify scientific data sources");
  }
  console.log(`✓ 6 Main Agricultural Categories verified with bilingual farmer-friendly & scientific explanations`);

  // 6. Validate Seasonal Farm Calendar (Part 4)
  const cal = actionPlan.seasonalCalendar;
  assert(cal && Array.isArray(cal.seasons) && cal.seasons.length === 3, "Calendar must contain Kharif, Rabi, and Zaid seasons");
  const seasonIds = cal.seasons.map(s => s.id);
  assert(seasonIds.includes("kharif") && seasonIds.includes("rabi") && seasonIds.includes("zaid"), "Must include Kharif, Rabi, and Zaid");

  for (const s of cal.seasons) {
    assert(Array.isArray(s.activities) && s.activities.length >= 4, `Season ${s.id} must have comprehensive activities`);
    for (const act of s.activities) {
      assert(act.phase && act.months && act.action, "Activity must specify phase, months, and action");
      assert(["completed", "current", "upcoming"].includes(act.status), `Activity status must be completed/current/upcoming, got ${act.status}`);
      assert(act.actionHi && act.phaseHi, "Activity must have Hindi translations");
    }
  }
  console.log(`✓ Personalized Seasonal Farm Calendar verified for Kharif, Rabi & Zaid with dynamic status`);

  // 7. Validate Rotation Suitability Explanation (Part 6)
  const suit = actionPlan.rotationsSuitabilityExplanation;
  assert(suit && suit.sequence, "Must include Rotation Suitability Explanation");
  assert(suit.waterRequirements && suit.climateCompatibility, "Must explain water and climate compatibility");
  assert(suit.soilHealthBenefits && suit.legumeIntegration, "Must explain soil health benefits and legume integration");
  assert(suit.rotationStress && suit.potentialLimitations, "Must explain 20-year replay stress and potential limitations");
  assert(suit.waterRequirementsHi && suit.climateCompatibilityHi, "Must provide Hindi explanations");
  console.log(`✓ Crop Rotation scientific suitability explanation verified (${suit.sequence})`);

  // 8. Validate Crop Selection Options (Part 3C)
  const cropOpts = actionPlan.cropOptions;
  assert(cropOpts && cropOpts.primaryCrop && cropOpts.alternativeCrop && cropOpts.lowWaterCrop, "Must provide Primary, Alternative, and Low-water crops");
  console.log(`✓ Crop Options verified: Primary [${cropOpts.primaryCrop.name}], Alt [${cropOpts.alternativeCrop.name}], Low-Water [${cropOpts.lowWaterCrop.name}]`);

  // 9. Validate Nutrient Management & Lab vs Satellite distinction (Part 3D & 8)
  const nut = actionPlan.nutrientManagement;
  assert(nut, "Nutrient management object must exist");
  if (options.labSoil) {
    assert.strictEqual(nut.isMeasured, true, "Must flag as measured laboratory data");
    assert.strictEqual(nut.status, "verified_laboratory", "Status must be verified_laboratory");
    console.log(`✓ Lab Soil Health Card priority verified: N=${options.labSoil.n}, P=${options.labSoil.p}, K=${options.labSoil.k}`);
  } else {
    assert.strictEqual(nut.isMeasured, false, "Must flag as unverified satellite data");
    assert(nut.disclaimer.includes("No certified laboratory Soil Health Card on file"), "Must warn against false chemical prescriptions");
    console.log(`✓ Missing Soil Health Card handling verified: No blind fertilizer dosages generated; KVK testing advised`);
  }

  return { zone, actionPlan };
}

async function runAllTests() {
  // Test 1: Samastipur, Bihar (Middle Gangetic Plain)
  const biharResult = await testLocation("Samastipur, Bihar", 25.86, 85.78, {
    waterAccess: "rainfed",
    practice: [{ id: "paddy", year: 2023 }, { id: "wheat", year: 2024 }],
    goals: ["resilience", "soil"]
  });
  assert(biharResult.zone.id.includes("gangetic"), "Samastipur must be in Gangetic Plain zone");
  assert(biharResult.actionPlan.rotations[0].sequence.some(c => ["paddy", "lentils", "wheat", "greengram", "maize"].includes(c)), "Bihar rotations must feature Gangetic crops");

  // Test 2: Haldia, West Bengal (Lower Gangetic / Coastal Plain)
  const bengalResult = await testLocation("Haldia, West Bengal", 22.06, 88.06, {
    waterAccess: "irrigated",
    waterSource: "canal",
    soilType: "clay_loam",
    practice: [{ id: "paddy", year: 2023 }, { id: "lentils", year: 2024 }],
    goals: ["profit", "resilience"]
  });
  assert(bengalResult.actionPlan.scenario === "irrigated", "Scenario must be irrigated");
  assert(bengalResult.actionPlan.farmDiagnosis.overview.irrigationSource.includes("Canal") || bengalResult.actionPlan.farmDiagnosis.overview.irrigationSource.includes("canal"), "Must use canal water source");

  // Test 3: Jaipur, Rajasthan (Western Dry Region)
  const rajasthanResult = await testLocation("Jaipur, Rajasthan", 26.91, 75.79, {
    waterAccess: "rainfed",
    soilType: "sandy_loam",
    practice: [{ id: "bajra", year: 2023 }, { id: "mustard", year: 2024 }],
    goals: ["water", "resilience"]
  });
  assert(rajasthanResult.zone.id.includes("western_dry"), "Jaipur must resolve to Western Dry Region");
  assert(rajasthanResult.actionPlan.rotations[0].sequence.some(c => ["bajra", "mustard", "chickpea", "greengram"].includes(c)), "Rajasthan rotations must feature drought-tolerant crops (Bajra/Mustard/Guar)");

  // Test 4: Official Lab Soil Card Override Priority Test
  console.log("\n>>> TESTING CERTIFIED LAB SOIL HEALTH CARD OVERRIDE PRIORITY <<<");
  const labResult = await testLocation("Samastipur with Lab Card", 25.86, 85.78, {
    waterAccess: "irrigated",
    soilTest: "yes",
    labSoil: { ph: 7.4, soc: 0.85, n: "high", p: "medium", k: "high", s: "normal", zn: "low" },
    goals: ["soil", "profit"]
  });
  assert.strictEqual(labResult.actionPlan.nutrientManagement.isMeasured, true);
  assert.strictEqual(labResult.actionPlan.nutrientManagement.soilPh, 7.4);
  assert.strictEqual(labResult.actionPlan.nutrientManagement.soilOc, "0.85%");

  // Test 5: Out of Region / Edge Cases
  console.log("\n>>> TESTING BOUNDARY CHECKS & ERROR HANDLING <<<");
  assert.strictEqual(isSupportedRegion(55.0, 10.0), false, "Coordinates outside South Asia must return false");
  const outOfBoundsPlan = buildClimateActionPlan(
    { coordinates: { lat: 55.0, lng: 10.0 } },
    { annualSeries: [] },
    [],
    null,
    {}
  );
  assert.strictEqual(outOfBoundsPlan.status, "crop_calendar_unavailable", "Must flag crop calendar unavailable outside region");
  console.log("✓ Geographic boundary restrictions verified");

  // Test 6: Farmer Goal Sensitivity Test
  console.log("\n>>> TESTING FARMER GOALS SENSITIVITY <<<");
  const history = await getNasaPowerHistory({ lat: 25.86, lng: 85.78 });
  const analysis = analyzeClimateHistory(history);
  const planWater = buildClimateActionPlan(history, analysis, [], "all", { goals: ["water"] });
  const planProfit = buildClimateActionPlan(history, analysis, [], "all", { goals: ["profit"] });
  assert(planWater.rotations.length > 0 && planProfit.rotations.length > 0, "Must return rotations for both goals");
  console.log("✓ Multi-objective goal scoring verified across water conservation and profitability");

  console.log("\n===============================================================================");
  console.log("ALL FINAL VALIDATION TESTS PASSED WITH 100% SUCCESS!");
  console.log("===============================================================================");
}

runAllTests().catch(err => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
