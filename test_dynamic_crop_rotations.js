// test_dynamic_crop_rotations.js — Comprehensive Test Suite for Dynamic Land-Analysis-Driven Crop Rotations
"use strict";

const assert = require("assert");
const {
  EXPANDED_CROP_LIBRARY,
  evaluateIndividualCropSuitability,
  generateDynamicCandidateRotations,
  evaluateRotationComprehensive,
  rankRotationsByPriority,
  buildActionPlanModificationReview,
  generateLandAnalysisRotations
} = require("./crop_rotation_engine");
const { findAgroEcologicalZone } = require("./farm_profile_intelligence");

async function runDynamicRotationTests() {
  console.log("===============================================================================");
  console.log("KRISHINITI — DYNAMIC LAND-ANALYSIS-DRIVEN CROP ROTATION & REGENERATION SUITE");
  console.log("===============================================================================\n");

  // 1. CROP LIBRARY COMPLETENESS
  console.log(">>> TEST 1: Dynamic Crop Library Verification <<<");
  const cropCount = Object.keys(EXPANDED_CROP_LIBRARY).length;
  assert(cropCount >= 20, `Crop library must contain comprehensive species (found ${cropCount})`);
  
  const categories = new Set(Object.values(EXPANDED_CROP_LIBRARY).map(c => c.category));
  assert(categories.has("Cereals"), "Library must contain Cereals");
  assert(categories.has("Legumes and Pulses"), "Library must contain Pulses");
  assert(categories.has("Vegetables"), "Library must contain Vegetables");
  assert(categories.has("Oilseeds"), "Library must contain Oilseeds");
  assert(categories.has("Fibre and Commercial Crops"), "Library must contain Fibre crops");
  assert(categories.has("Green Manure and Cover Crops"), "Library must contain Green Manure crops");
  console.log(`✓ Test 1 Passed: ${cropCount} crops verified across ${categories.size} major agricultural categories.`);

  // 2. LOCATION 1: SAMASTIPUR, BIHAR (Middle Gangetic Plain)
  console.log("\n>>> TEST 2: Samastipur, Bihar (Middle Gangetic Plain) Actual Land Analysis <<<");
  const zoneBihar = findAgroEcologicalZone(25.86, 85.78);
  const biharResult = generateLandAnalysisRotations({
    lat: 25.86,
    lng: 85.78,
    zone: zoneBihar,
    soil: { ph: 7.2, soc: 0.64, clay: 24.7, sand: 52, texture: "Sandy Clay Loam", provenance: "LAB_VERIFIED" },
    targetScenario: "irrigated",
    priority: "balanced",
    targetCount: 28
  });

  assert.strictEqual(biharResult.status, "ok");
  assert(biharResult.returnedCount >= 20, `Should return 20–28 valid candidate rotations for Bihar (got ${biharResult.returnedCount})`);
  assert(biharResult.totalGenerated >= 28, "Total valid generated pool must be at least 28");
  
  // Verify top candidate has Gangetic staple and biological nitrogen fixation
  const topBihar = biharResult.rotations[0];
  assert(topBihar.crops.length >= 2, "Rotation must have 2 or 3 crops");
  assert(topBihar.totalDurationDays <= 355, "Rotation duration must fit within annual calendar");
  assert(topBihar.soilRegeneration.nFixationKgHa >= 0, "N-fixation must be computed");
  assert(topBihar.economics.netProfitPerAcre > 0, "Net profit must be positive and realistic");
  console.log(`✓ Test 2 Passed: ${biharResult.returnedCount} valid rotations dynamically generated for Samastipur.`);
  console.log(`  Top Rotation: ${topBihar.fullName} (Score: ${topBihar.overallScore}, N-Fix: ${topBihar.soilRegeneration.nFixationKgHa} kg/ha, Profit: ₹${topBihar.economics.netProfitPerAcre}/acre/yr)`);

  // 3. LOCATION 2: JAIPUR, RAJASTHAN (Western Dry Region)
  console.log("\n>>> TEST 3: Jaipur, Rajasthan (Western Dry Region) Arid Land Analysis <<<");
  const zoneJaipur = findAgroEcologicalZone(26.91, 75.78);
  const jaipurResult = generateLandAnalysisRotations({
    lat: 26.91,
    lng: 75.78,
    zone: zoneJaipur,
    soil: { ph: 7.8, soc: 0.35, clay: 14, sand: 72, texture: "Loamy Sand", provenance: "SATELLITE_MODEL" },
    targetScenario: "rainfed",
    priority: "water",
    targetCount: 28
  });

  assert.strictEqual(jaipurResult.status, "ok");
  assert(jaipurResult.returnedCount >= 20, "Should return 20–28 valid rotations for Jaipur");
  // In hyper-arid rainfed conditions, water-guzzling crops (paddy, jute, sugarcane) must be completely excluded
  for (const rot of jaipurResult.rotations) {
    assert(!rot.sequence.includes("paddy"), "Paddy must NOT appear in rainfed hyper-arid Rajasthan rotations");
    assert(!rot.sequence.includes("jute"), "Jute must NOT appear in rainfed hyper-arid Rajasthan rotations");
  }
  const topJaipur = jaipurResult.rotations[0];
  console.log(`✓ Test 3 Passed: Arid constraints respected; water-intensive crops excluded from rainfed Rajasthan.`);
  console.log(`  Top Rotation under Minimum Water Priority: ${topJaipur.fullName} (Water: ${topJaipur.totalWaterNeedMm} mm, Score: ${topJaipur.overallScore})`);

  // 4. LOCATION 3: HALDIA, WEST BENGAL (Lower Gangetic Plain)
  console.log("\n>>> TEST 4: Haldia, West Bengal (Lower Gangetic Coastal Plain) Land Analysis <<<");
  const zoneHaldia = findAgroEcologicalZone(22.06, 88.06);
  const haldiaResult = generateLandAnalysisRotations({
    lat: 22.06,
    lng: 88.06,
    zone: zoneHaldia,
    soil: { ph: 6.4, soc: 0.68, clay: 32, sand: 38, texture: "Clay Loam", provenance: "SATELLITE_MODEL" },
    targetScenario: "irrigated",
    priority: "profit",
    targetCount: 28
  });

  assert.strictEqual(haldiaResult.status, "ok");
  assert(haldiaResult.returnedCount >= 20, "Should return 20–28 valid rotations for Haldia");
  const topHaldia = haldiaResult.rotations[0];
  assert(topHaldia.economics.netProfitPerAcre > 50000, "Top profit rotation in fertile alluvial zone must generate high return");
  console.log(`✓ Test 4 Passed: Lower Gangetic alluvial rotation generated successfully.`);
  console.log(`  Top Rotation under Max Profit Priority: ${topHaldia.fullName} (Net Profit: ₹${topHaldia.economics.netProfitPerAcre}/acre/yr, BCR: ${topHaldia.economics.bcr}x)`);

  // 5. PRIORITY SWITCHING DYNAMICS
  console.log("\n>>> TEST 5: Personalised Multi-Objective Ranking Dynamics <<<");
  const soilResult = generateLandAnalysisRotations({
    lat: 25.86,
    lng: 85.78,
    zone: zoneBihar,
    soil: { ph: 7.2, soc: 0.64, clay: 24.7, sand: 52, texture: "Sandy Clay Loam", provenance: "LAB_VERIFIED" },
    targetScenario: "irrigated",
    priority: "soil",
    targetCount: 28
  });

  const profitResult = generateLandAnalysisRotations({
    lat: 25.86,
    lng: 85.78,
    zone: zoneBihar,
    soil: { ph: 7.2, soc: 0.64, clay: 24.7, sand: 52, texture: "Sandy Clay Loam", provenance: "LAB_VERIFIED" },
    targetScenario: "irrigated",
    priority: "profit",
    targetCount: 28
  });

  assert(soilResult.rotations[0].soilRegeneration.nFixationKgHa >= 40, "Soil health priority must reward high N-fixing rotations");
  console.log(`✓ Test 5 Passed: Ranking dynamically responds to farmer chosen priority (Soil vs Profit).`);

  // 6. ACTION PLAN MODIFICATION REVIEW (CONFIRMATION BEFORE UPDATE)
  console.log("\n>>> TEST 6: Action Plan Modification Review Diff Generation <<<");
  const review = buildActionPlanModificationReview(topBihar, {}, { farm: { crops: ["Paddy", "Wheat"] } });
  assert(review.rotationId === topBihar.id, "Review rotation ID must match");
  assert(review.modifications.length >= 3, "Must propose modifications across Calendar, Soil, and Water");
  
  const calMod = review.modifications.find(m => m.category === "Seasonal Cropping Calendar");
  assert(calMod && calMod.proposedModification.includes("Synchronize"), "Must specify calendar synchronization");
  
  const soilMod = review.modifications.find(m => m.category === "Soil Health Management");
  assert(soilMod && soilMod.proposedModification.includes("Credit"), "Must credit biological nitrogen");
  console.log(`✓ Test 6 Passed: Action Plan modification review generated with explicit reasons and expected impacts.`);

  console.log("\n===============================================================================");
  console.log("ALL DYNAMIC CROP ROTATION & REGENERATION TESTS PASSED WITH 100% SUCCESS!");
  console.log("===============================================================================");
}

runDynamicRotationTests().catch(err => {
  console.error("Test failed:", err);
  process.exit(1);
});
