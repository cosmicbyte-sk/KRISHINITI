// scratch/test_client_engine.js
const { findAgroEcologicalZone } = require("../farm_profile_intelligence");
const { generateLandAnalysisRotations } = require("../crop_rotation_engine");
const ap = require("../action_plan");

function generateClientActionPlan({ lat, lng, practice = [], duration = "all", farmContext = {}, scenario = "rainfed" }) {
  const cLat = Number(lat) || 25.86;
  const cLng = Number(lng) || 85.78;
  const zone = findAgroEcologicalZone(cLat, cLng);

  const soilContext = {
    ph: farmContext.labSoil?.ph ?? (farmContext.soilType === "calcareous" ? 8.2 : (zone?.id?.includes("gangetic") ? 7.2 : 6.8)),
    soc: farmContext.labSoil?.soc ?? 0.65,
    clay: zone?.id?.includes("gangetic") ? 24.7 : 28,
    sand: zone?.id?.includes("gangetic") ? 52 : 45,
    provenance: farmContext.labSoil ? "LAB_VERIFIED" : "SATELLITE_MODEL",
    verifiedLabSoil: farmContext.labSoil
  };

  const dynamicRotationResult = generateLandAnalysisRotations({
    lat: cLat,
    lng: cLng,
    zone,
    soil: soilContext,
    water: { access: scenario },
    farmContext,
    practice
  });

  const rotations = dynamicRotationResult.rotations || [];

  const analysis = {
    coverage: { startYear: 1981, lastCompleteYear: 2025, completeYears: 45 },
    metrics: {
      totalRainfallMm: { label: "Total rainfall", unit: "mm", recent: { mean: 1145, median: 1120 }, full: { mean: 1180 }, trend: { slopePerDecade: -24.5, pValue: 0.12, significant: false } },
      meanTemperatureC: { label: "Mean temperature", unit: "°C", recent: { mean: 25.4, median: 25.3 }, full: { mean: 24.9 }, trend: { slopePerDecade: 0.28, pValue: 0.02, significant: true } },
      rainySeasonOnsetDoy: { label: "Rainy-season onset", unit: "day of year", recent: { mean: 172, median: 170 }, full: { mean: 168 }, trend: { slopePerDecade: 2.1, pValue: 0.18, significant: false } },
      longestRainySeasonDrySpell: { label: "Longest rainy-season dry spell", unit: "days", recent: { mean: 12, median: 11 }, full: { mean: 10 }, trend: { slopePerDecade: 0.8, pValue: 0.15, significant: false } },
      hotDaysAbove35C: { label: "Hot days above 35°C", unit: "days", recent: { mean: 48, median: 46 }, full: { mean: 42 }, trend: { slopePerDecade: 3.4, pValue: 0.03, significant: true } },
      hotDaysAbove40C: { label: "Hot days above 40°C", unit: "days", recent: { mean: 14, median: 12 }, full: { mean: 10 }, trend: { slopePerDecade: 1.8, pValue: 0.04, significant: true } },
      referenceEt0Mm: { label: "Reference ET₀ (Hargreaves)", unit: "mm", recent: { mean: 1480, median: 1475 }, full: { mean: 1460 }, trend: { slopePerDecade: 12.0, pValue: 0.08, significant: false } },
      rootWetness: { label: "Mean root-zone wetness", unit: "0–1", recent: { mean: 0.42, median: 0.41 }, full: { mean: 0.43 }, trend: { slopePerDecade: -0.01, pValue: 0.22, significant: false } },
      surfaceWetness: { label: "Mean surface wetness", unit: "0–1", recent: { mean: 0.38, median: 0.37 }, full: { mean: 0.39 }, trend: { slopePerDecade: -0.01, pValue: 0.25, significant: false } },
      solarRadiationMjM2: { label: "Mean daily solar radiation", unit: "MJ/m²/day", recent: { mean: 18.2, median: 18.1 }, full: { mean: 18.4 }, trend: { slopePerDecade: -0.15, pValue: 0.30, significant: false } },
      relativeHumidityPct: { label: "Mean relative humidity", unit: "%", recent: { mean: 68, median: 69 }, full: { mean: 67 }, trend: { slopePerDecade: 0.5, pValue: 0.40, significant: false } }
    },
    rainySeason: { months: ["Jun", "Jul", "Aug", "Sep"] },
    annualSeries: []
  };

  const decadalExtremes = [
    { decade: "1980s", totalRainfallMm: 1210, meanTemperatureC: 24.6, hotDaysAbove35C: 38, longestRainySeasonDrySpell: 9, rainySeasonOnsetDoy: 166, referenceEt0Mm: 1440 },
    { decade: "1990s", totalRainfallMm: 1195, meanTemperatureC: 24.8, hotDaysAbove35C: 41, longestRainySeasonDrySpell: 10, rainySeasonOnsetDoy: 168, referenceEt0Mm: 1455 },
    { decade: "2000s", totalRainfallMm: 1160, meanTemperatureC: 25.1, hotDaysAbove35C: 45, longestRainySeasonDrySpell: 11, rainySeasonOnsetDoy: 170, referenceEt0Mm: 1470 },
    { decade: "2010s", totalRainfallMm: 1135, meanTemperatureC: 25.3, hotDaysAbove35C: 49, longestRainySeasonDrySpell: 13, rainySeasonOnsetDoy: 173, referenceEt0Mm: 1485 },
    { decade: "2020s", totalRainfallMm: 1120, meanTemperatureC: 25.6, hotDaysAbove35C: 52, longestRainySeasonDrySpell: 14, rainySeasonOnsetDoy: 175, referenceEt0Mm: 1500 }
  ];

  const diag = ap.buildFarmDiagnosis({ analysis, zone, options: farmContext, rotations, practice, lat: cLat, lng: cLng });
  const recs = ap.buildStructuredRecommendations({ analysis, zone, options: farmContext, rotations, practice, targetScenario: scenario, lat: cLat, lng: cLng });
  const cal = ap.buildSeasonalCalendar({ zone, rotations, practice, targetScenario: scenario, options: farmContext });
  const cropOpts = ap.buildCropOptions(rotations, zone, farmContext, scenario);
  const rotExplanation = ap.buildRotationSuitabilityExplanation(rotations[0], null, zone, scenario);
  const nutrient = ap.buildNutrientStatus({ zone, options: farmContext, labSoil: farmContext.labSoil });

  return {
    ...analysis,
    provenance: {
      status: "LIVE",
      source: "NASA POWER Daily Point API & ICAR Agro-Ecological Framework",
      parameters: ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "ALLSKY_SFC_SW_DWN", "GWETROOT"],
      retrievedAt: new Date().toISOString()
    },
    method: {
      et0Method: "Daily Hargreaves-Samani reference ET₀ from T2M_MAX, T2M_MIN, day of year, and field latitude (radiation in MJ/m²/day converted to mm/day equivalent via 0.408 factor).",
      trendMethod: "Theil-Sen slope per decade and two-sided Mann-Kendall test; p < 0.05 is statistically significant.",
      projectionMethod: "Statistical trend projection with approximate 80% prediction interval for significant trends only."
    },
    actionPlan: {
      status: "ok",
      yearsEvaluated: 20,
      years: { start: 2005, end: 2024 },
      coverage: { startYear: 1981, endYear: 2025 },
      scenario,
      goals: farmContext.goals || ["profit", "resilience", "soil"],
      agroZone: zone,
      rotations,
      dynamicRotationsData: dynamicRotationResult,
      farmDiagnosis: diag,
      structuredRecommendations: recs,
      seasonalCalendar: cal,
      cropOptions: cropOpts,
      rotationsSuitabilityExplanation: rotExplanation,
      nutrientManagement: nutrient,
      decadalExtremes,
      method: {
        waterBalance: "Daily rainfall enters a 100 mm root-zone bucket initialized from NASA POWER GWETROOT at sowing; daily Hargreaves ET₀ removed by FAO-56 Kc stage."
      }
    }
  };
}

const plan = generateClientActionPlan({ lat: 25.86, lng: 85.78, scenario: "rainfed" });
console.log("Success! Generated action plan keys:", Object.keys(plan.actionPlan));
console.log("Rotations count:", plan.actionPlan.rotations.length);
console.log("Farm Diagnosis categories:", plan.actionPlan.farmDiagnosis.categories.length);
console.log("Seasonal Calendar seasons:", plan.actionPlan.seasonalCalendar.seasons.length);
console.log("Structured Recs count:", plan.actionPlan.structuredRecommendations.length);
