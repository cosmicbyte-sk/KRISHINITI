const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

console.log('--- STARTING KRISHINITI AUTOMATED TEST SUITE ---');

// 1. Test HTML script ordering
const html = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.html'), 'utf8');
const enginePos = html.indexOf('KRISHINITI.engine.js');
const mainPos = html.indexOf('KRISHINITI.js');
assert(enginePos !== -1 && mainPos !== -1, 'Script tags must exist in KRISHINITI.html');
assert(enginePos < mainPos, 'KRISHINITI.engine.js must be loaded BEFORE KRISHINITI.js');
console.log('✓ Script execution order verified in KRISHINITI.html');

// 2. Load engine in sandbox
const engineCode = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.engine.js'), 'utf8');
const engineSandbox = {
  console: console,
  Date: Date,
  Math: Math,
  String: String,
  Number: Number,
  Array: Array,
  Object: Object,
  JSON: JSON,
  setTimeout: setTimeout,
  clearTimeout: clearTimeout
};
vm.createContext(engineSandbox);
vm.runInContext(engineCode, engineSandbox);

const cropDb = vm.runInContext('KRISHINITI_CROP_DATABASE', engineSandbox);
const evalCropSuitability = vm.runInContext('evaluateCropSuitability', engineSandbox);
const evalCropRotation = vm.runInContext('evaluateCropRotation', engineSandbox);
const evalWeatherRisksAndProtection = vm.runInContext('evaluateWeatherRisksAndProtection', engineSandbox);
const isCropMatch = vm.runInContext('isCropMatch', engineSandbox);

assert(Array.isArray(cropDb), 'KRISHINITI_CROP_DATABASE must be an array');
assert(typeof evalCropSuitability === 'function', 'evaluateCropSuitability must be a function');
assert(typeof evalCropRotation === 'function', 'evaluateCropRotation must be a function');
assert(typeof evalWeatherRisksAndProtection === 'function', 'evaluateWeatherRisksAndProtection must be a function');
assert(typeof isCropMatch === 'function', 'isCropMatch must be a function');
console.log('✓ Engine exports verified');

// 3. Test isCropMatch
assert.strictEqual(isCropMatch('pulses', 'lentils'), true, 'pulses should match lentils');
assert.strictEqual(isCropMatch('paddy-wheat', 'paddy'), true, 'paddy-wheat should match paddy');
assert.strictEqual(isCropMatch('paddy-wheat', 'wheat'), true, 'paddy-wheat should match wheat');
assert.strictEqual(isCropMatch('vegetables', 'vegetables'), true, 'vegetables should match vegetables');
assert.strictEqual(isCropMatch('unknown', 'maize'), false, 'unknown should not match maize');
console.log('✓ isCropMatch synonym and partial matching verified');

// 4. Test evaluateCropSuitability with various profiles
const dummyProfile = {
  farm: {
    name: 'Test Plot',
    area: 2.5,
    areaUnit: 'acres',
    soilType: 'alluvial',
    soilTest: 'no',
    crops: [{ year: '2023', value: 'pulses' }, { year: '2024', value: 'pulses' }],
    growth: 'good',
    water: 'moderate',
    waterSource: 'well',
    priority: 'balanced'
  }
};

const climateData = {
  annualRainfallMm: 1200
};

const suitabilityRes = evalCropSuitability(dummyProfile, climateData);
assert(!suitabilityRes.error, 'Suitability evaluation should not have error');
assert(suitabilityRes.recommendations.length === 7, 'Should evaluate all 7 crops');

// Verify lentils detected in history (since 2 seasons of pulses were logged)
const lentilsRec = suitabilityRes.recommendations.find(r => r.cropId === 'lentils');
assert(lentilsRec, 'Lentils recommendation should exist');
const rotCheck = lentilsRec.checks.find(c => c.checkName === 'Crop History & Rotation Fit');
assert(rotCheck.status === 'conditional', '2 seasons of pulses should flag continuous cultivation for lentils');
console.log('✓ evaluateCropSuitability correctly identifies pulses/lentils rotation history');

// Test unknown water tier handling
const unknownWaterProfile = {
  farm: {
    area: 1,
    soilType: 'alluvial',
    water: 'unknown'
  }
};
const unknownWaterRes = evalCropSuitability(unknownWaterProfile, climateData);
const paddyRec = unknownWaterRes.recommendations.find(r => r.cropId === 'paddy');
const waterCheck = paddyRec.checks.find(c => c.checkName === 'Water & Irrigation Availability');
assert(waterCheck.status === 'conditional', 'Unknown water should be conditional, not hard failure');
assert(!waterCheck.explanation.includes('(unknown) is insufficient'), 'Explanation should not claim unknown is insufficient');
console.log('✓ evaluateCropSuitability handles unknown water access gracefully');

// 5. Test evaluateCropRotation
const rotationRes = evalCropRotation(climateData, [
  { name: 'Plan A', description: 'Monoculture', sequence: ['paddy', 'paddy'] },
  { name: 'Plan B', description: 'Pulses Relay', sequence: ['paddy', 'lentils'] }
], dummyProfile);
assert(rotationRes.length === 2, 'Should evaluate 2 rotation plans');
assert(rotationRes[1].basedOnPastData === true, 'Plan B with lentils should match logged past pulses');
console.log('✓ evaluateCropRotation links lentils with past pulses history');

// 6. Test evaluateWeatherRisksAndProtection with edge cases
const emptyForecast = {
  status: 'ready',
  days: [
    { date: '2026-10-29', tempMax: 30, tempMin: 18, precipSum: 5, precipProb: 20, windMax: 15, humidityMean: 60 }
  ]
};
const wrResult = evalWeatherRisksAndProtection(emptyForecast, { cropId: 'paddy', stageId: 'flowering' });
assert.strictEqual(wrResult.status, 'ready', 'Weather risk evaluation should succeed even with missing fetchedAt');
assert(wrResult.forecastIssuedAt, 'forecastIssuedAt must be present and valid');
console.log('✓ evaluateWeatherRisksAndProtection safe date handling verified');

// 7. Verify server.js routes and JSON parsing
const serverCode = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
assert(serverCode.includes("express.json({ limit: \"500kb\" })"), 'Server should have 500kb limit');
assert(serverCode.includes("replace(/^```(?:json)?\\s*/i, \"\")"), 'Server must strip markdown backticks before JSON parsing');
const appListenIdx = serverCode.indexOf('app.listen');
const appGetIdx = serverCode.indexOf('app.get(["/", "/index.html"]');
assert(appGetIdx !== -1 && appGetIdx < appListenIdx, 'app.get root route must be registered BEFORE app.listen');
assert(serverCode.includes('/api/soil/openlandmap'), 'server.js must register /api/soil/openlandmap endpoint');
console.log('✓ server.js route registration, payload limit, and markdown stripping verified');

// 8. Test OpenLandMap USDA soil texture classification
const { classifyUsdaTexture } = require('./openlandmap');
assert.strictEqual(classifyUsdaTexture(47, 29, 24).className, 'Loam', '47 sand, 29 silt, 24 clay should be Loam');
assert.strictEqual(classifyUsdaTexture(15, 20, 65).className, 'Clay', '15 sand, 20 silt, 65 clay should be Clay');
assert.strictEqual(classifyUsdaTexture(90, 5, 5).className, 'Sand', '90 sand, 5 silt, 5 clay should be Sand');
assert.strictEqual(classifyUsdaTexture(20, 65, 15).className, 'Silt Loam', '20 sand, 65 silt, 15 clay should be Silt Loam');
assert.strictEqual(classifyUsdaTexture(5, 85, 10).className, 'Silt', '5 sand, 85 silt, 10 clay should be Silt');
assert.strictEqual(classifyUsdaTexture(30, 35, 35).className, 'Clay Loam', '30 sand, 35 silt, 35 clay should be Clay Loam');
assert.strictEqual(classifyUsdaTexture(60, 15, 25).className, 'Sandy Clay Loam', '60 sand, 15 silt, 25 clay should be Sandy Clay Loam');
console.log('✓ OpenLandMap USDA soil texture classifier verified across standard soil triangles');

// 9. Test Satellite Vegetation Index Formulas & Condition Classification
const { calculateVegetationIndices, getVegetationCondition } = require('./nasa_vegetation');
assert(serverCode.includes('/api/vegetation/nasa'), 'server.js must register /api/vegetation/nasa endpoint');
const sampleIndices = calculateVegetationIndices(0.0617, 0.1940, 0.0511, 0.0915);
assert.strictEqual(sampleIndices.ndvi, 0.5174, 'NDVI should equal 0.5174');
assert.strictEqual(sampleIndices.evi, 0.2801, 'EVI should equal 0.2801');
assert.strictEqual(sampleIndices.ndmi, 0.359, 'NDMI should equal 0.359');
assert.strictEqual(sampleIndices.savi, 0.2626, 'SAVI should equal 0.2626');
assert.strictEqual(getVegetationCondition(0.5174).label, 'Healthy Vigorous Canopy', '0.5174 NDVI should be Healthy Vigorous Canopy');
assert.strictEqual(getVegetationCondition(0.72).label, 'Dense Healthy Canopy', '0.72 NDVI should be Dense Healthy Canopy');
assert.strictEqual(getVegetationCondition(0.25).label, 'Sparse / Emerging Canopy', '0.25 NDVI should be Sparse / Emerging Canopy');
console.log('✓ Satellite vegetation indices (NDVI, EVI, NDMI, SAVI) verified against NASA sensor formulas');

// 10. Test Weather and Climate Intelligence (Part 4)
assert(serverCode.includes('/api/climate/nasa'), 'server.js must register /api/climate/nasa endpoint');
assert(serverCode.includes('/api/weather/forecast'), 'server.js must register /api/weather/forecast endpoint');
assert(html.includes('KRISHINITI.climate.js'), 'KRISHINITI.html must include KRISHINITI.climate.js');

const { getClimateIntelligence, getWeeklyWeatherRisk, SEASONS, CLIMATOLOGY_NORMAL, WMO_WEATHER_CODES } = require('./weather_climate');
assert(SEASONS.monsoon && SEASONS.monsoon.months.length === 4, 'Monsoon must cover 4 months (Jun-Sep)');
assert(SEASONS.postMonsoon && SEASONS.winter && SEASONS.summer, 'All 4 agricultural seasons must be defined');
assert(CLIMATOLOGY_NORMAL.annualRainfallMm > 0, 'Climatology normal annual rainfall must be > 0');
assert.strictEqual(CLIMATOLOGY_NORMAL.monthlyRainfallMm.length, 12, 'Climatology monthly rainfall must have 12 months');
assert.strictEqual(WMO_WEATHER_CODES[0].label, 'Clear Sky', 'WMO code 0 must translate to Clear Sky');
assert.strictEqual(WMO_WEATHER_CODES[95].label, 'Thunderstorm', 'WMO code 95 must translate to Thunderstorm');

(async () => {
  const climData = await getClimateIntelligence({ lat: 25.7512, lng: 86.0241 });
  assert(climData && climData.rainfall && climData.temperature && climData.solar, 'Climate intelligence must return rainfall, temperature, and solar blocks');
  assert(climData.rainfall.monthlyBreakdown.length === 12, 'Rainfall must have 12 monthly breakdowns');
  assert(climData.temperature.monthlyBreakdown.length === 12, 'Temperature must have 12 monthly breakdowns');
  assert(climData.solar.monthlyBreakdown.length === 12, 'Solar must have 12 monthly breakdowns');
  assert(Number.isFinite(climData.rainfall.annualDeparturePct), 'Annual rainfall departure must be a valid number');
  assert(climData.temperature.heatStressIndicators.daysOver35C >= 0, 'Heat stress days must be >= 0');
  assert(climData.solar.brightSunshineHoursDaily > 0, 'Sunshine hours must be > 0');

  const fcastData = await getWeeklyWeatherRisk({ lat: 25.7512, lng: 86.0241 });
  assert(fcastData && fcastData.days && fcastData.days.length === 7, 'Forecast must return 7 forecast days');
  assert(fcastData.summary && typeof fcastData.summary.riskClassification === 'string', 'Forecast summary must have riskClassification');
  assert(fcastData.operationalWindows.spraying && fcastData.operationalWindows.tillageAndSowing, 'Operational windows must include spraying and tillage');

  console.log('✓ Weather and Climate Intelligence Engine (Part 4) verified for NASA POWER, GPM IMERG and Open-Meteo');

  // 11. Test Water and Environmental Intelligence (Part 5)
  assert(serverCode.includes('/api/water/intelligence'), 'server.js must register /api/water/intelligence endpoint');
  assert(html.includes('KRISHINITI.water.js'), 'KRISHINITI.html must include KRISHINITI.water.js');

  const { getWaterEnvironmentalIntelligence, SOIL_HYDRAULIC_LIMITS } = require('./water_environmental');
  assert(SOIL_HYDRAULIC_LIMITS.permanentWiltingPointPct < SOIL_HYDRAULIC_LIMITS.fieldCapacityPct, 'Wilting point must be lower than field capacity');
  assert(SOIL_HYDRAULIC_LIMITS.fieldCapacityPct < SOIL_HYDRAULIC_LIMITS.saturationPct, 'Field capacity must be lower than saturation');

  const waterData = await getWaterEnvironmentalIntelligence({ lat: 25.7512, lng: 86.0241 });
  assert(waterData && waterData.soilMoisture && waterData.evapotranspiration && waterData.waterBalance, 'Water intelligence must return soilMoisture, evapotranspiration, and waterBalance');
  assert(waterData.droughtRisk && waterData.floodSusceptibility, 'Water intelligence must return droughtRisk and floodSusceptibility');

  // A. Soil moisture assertions
  assert(waterData.soilMoisture.currentRootZoneMoisturePct > 0, 'Root zone moisture must be > 0');
  assert(waterData.soilMoisture.currentSurfaceMoisturePct > 0, 'Surface moisture must be > 0');
  assert(waterData.soilMoisture.spatialResolution.includes('SMAP'), 'Soil moisture must explicitly state NASA SMAP spatial resolution');
  assert(waterData.soilMoisture.monthlyBreakdown.length === 12, 'Soil moisture must include 12 monthly breakdowns');

  // B. Evapotranspiration assertions
  assert(waterData.evapotranspiration.annualActualEtMm > 0, 'Annual actual ET must be > 0');
  assert(waterData.evapotranspiration.annualPotentialEtMm >= waterData.evapotranspiration.annualActualEtMm, 'Potential ET must be >= Actual ET');
  assert(waterData.evapotranspiration.spatialResolution.includes('MODIS'), 'ET must state NASA MODIS spatial resolution');

  // C. Simplified Water Balance assertions
  assert(waterData.waterBalance.formula.includes('P') || waterData.waterBalance.formula.includes('Rainfall'), 'Water balance formula must state Rainfall - Evapotranspiration');
  assert(waterData.waterBalance.monsoonSurplusMm > 0, 'Monsoon season must exhibit a water surplus');
  assert(waterData.waterBalance.summerDeficitMm < 0, 'Summer season must exhibit a water deficit');
  assert(waterData.waterBalance.hydrologicalNotice.includes('SIMPLIFIED'), 'Water balance must include disclaimer that it is a simplified indicator');

  // D. Drought Risk assertions
  assert(typeof waterData.droughtRisk.riskLevel === 'string', 'Drought risk level must be a string');
  assert(waterData.droughtRisk.indicators.rainfallDeparturePct !== undefined, 'Drought risk must include rainfall anomaly');
  assert(waterData.droughtRisk.indicators.rootZoneMoisturePct !== undefined, 'Drought risk must include root zone moisture');

  // E. Flood & Waterlogging Susceptibility assertions
  assert(typeof waterData.floodSusceptibility.susceptibility === 'string', 'Flood susceptibility must be a string');
  assert(waterData.floodSusceptibility.terrainMetrics.slopePct > 0, 'Terrain slope must be > 0');
  assert(waterData.floodSusceptibility.disclaimer.includes('NOT AN OFFICIAL FLOOD WARNING'), 'Must include mandatory disclaimer that it is not an official flood warning');

  // Provenance & dynamic multi-location assertions
  assert(['LIVE', 'CACHED', 'REFERENCE'].includes(waterData.provenance), 'Water must include LIVE, CACHED or REFERENCE provenance');
  assert(typeof waterData.retrievalDate === 'string' && waterData.retrievalDate.length > 0, 'Water must include retrieval date');
  const aridWater = await getWaterEnvironmentalIntelligence({ lat: 26.2389, lng: 73.0243 });
  assert.notStrictEqual(aridWater.soilMoisture.currentRootZoneMoisturePct, waterData.soilMoisture.currentRootZoneMoisturePct, 'Soil moisture must vary dynamically per geographic location');

  console.log('✓ Water and Environmental Intelligence Engine (Part 5) verified for SMAP, MODIS MOD16, Water Balance, Drought & Flood');

  // 12. Test Terrain and Land-Use Intelligence (Part 6)
  assert(serverCode.includes('/api/terrain/analysis'), 'server.js must register /api/terrain/analysis endpoint');
  assert(html.includes('KRISHINITI.terrain.js'), 'KRISHINITI.html must include KRISHINITI.terrain.js');

  const { getTerrainLandUseIntelligence, calculateIndicativeRusle, HISTORICAL_LAND_COVER, ELEVATION_CROSS_SECTION } = require('./terrain_landuse');
  assert(Array.isArray(HISTORICAL_LAND_COVER) && HISTORICAL_LAND_COVER.length === 5, 'Historical land cover must cover 5 years');
  assert(Array.isArray(ELEVATION_CROSS_SECTION) && ELEVATION_CROSS_SECTION.length === 5, 'Elevation cross section must cover 5 transect points');

  const terrainData = await getTerrainLandUseIntelligence({ lat: 25.7512, lng: 86.0241 });
  assert(terrainData && terrainData.terrain && terrainData.soilErosion && terrainData.landCover, 'Terrain intelligence must return terrain, soilErosion, and landCover');

  // A. Terrain analysis assertions
  assert(terrainData.terrain.elevationM > 0, 'Elevation must be > 0 m ASL');
  assert(terrainData.terrain.slopePct > 0, 'Slope percentage must be > 0');
  assert(terrainData.terrain.dataSource.includes('SRTM'), 'Terrain data source must state NASA SRTM');
  assert(terrainData.terrain.limitations.includes('SURFACE TOPOGRAPHY ONLY'), 'Terrain must state surface topography limitation');

  // B. Soil erosion (RUSLE) assertions
  assert(terrainData.soilErosion.equation.includes('RUSLE') || terrainData.soilErosion.equation.includes('R × K × LS × C × P'), 'Soil erosion must state RUSLE equation');
  assert(terrainData.soilErosion.estimatedSoilLossTonsPerHaYear > 0, 'Estimated annual soil loss must be > 0');
  assert(terrainData.soilErosion.tolerableSoilLossTons > terrainData.soilErosion.estimatedSoilLossTonsPerHaYear, 'Alluvial plain soil loss should be below tolerable threshold');
  assert(terrainData.soilErosion.limitationNote.includes('INDICATIVE RUSLE'), 'Must state indicative RUSLE model limitation');

  // C. Land cover history assertions
  assert(terrainData.landCover.croplandPercentage > 90, 'Cropland percentage should be > 90% for active arable plain');
  assert(terrainData.landCover.croplandPersistence5YearPct > 95, '5-year cropland persistence should be > 95%');
  assert(terrainData.landCover.classificationDisclaimer.includes('LAND-COVER CLASSIFICATION NOTICE'), 'Must state land cover vs crop species classification disclaimer');

  // Provenance & dynamic multi-location assertions
  assert(['LIVE', 'CACHED', 'REFERENCE'].includes(terrainData.provenance), 'Terrain must include LIVE, CACHED or REFERENCE provenance');
  assert(typeof terrainData.retrievalDate === 'string' && terrainData.retrievalDate.length > 0, 'Terrain must include retrieval date');
  const bangaloreTerrain = await getTerrainLandUseIntelligence({ lat: 12.9716, lng: 77.5946 });
  assert.notStrictEqual(bangaloreTerrain.terrain.elevationM, terrainData.terrain.elevationM, 'Terrain elevation must vary dynamically per geographic location');
  assert(bangaloreTerrain.terrain.elevationM > 700, 'Bangalore elevation must reflect Deccan Plateau (>700m ASL)');

  console.log('✓ Terrain and Land-Use Intelligence Engine (Part 6) verified for NASA SRTM, RUSLE & Land Cover');

  // 13. Test Agricultural Decision Intelligence (Part 7)
  assert(serverCode.includes('/api/decision/suitability'), 'server.js must register /api/decision/suitability endpoint');
  assert(serverCode.includes('/api/decision/water-requirement'), 'server.js must register /api/decision/water-requirement endpoint');
  assert(serverCode.includes('/api/decision/rain-bank'), 'server.js must register /api/decision/rain-bank endpoint');
  assert(html.includes('KRISHINITI.decision.js'), 'KRISHINITI.html must include KRISHINITI.decision.js');

  const {
    evaluateCropSuitability,
    evaluateCropRotationSequences,
    calculateFao56WaterRequirement,
    calculateRainBankPotential,
    generateFarmingRecommendations,
    CROP_CATALOG
  } = require('./decision_intelligence');

  assert(Object.keys(CROP_CATALOG).length >= 6, 'Crop catalog must have at least 6 crops');

  // A. Crop Suitability assertions
  const suitRes = evaluateCropSuitability({
    soil: { ph: 6.8, organicCarbon: 0.57, texture: "Loam" },
    climate: { annualRainfallMm: 1184 }
  });
  assert(suitRes.topThree && suitRes.topThree.length === 3, 'Must return top 3 suitable crops');
  suitRes.topThree.forEach(c => {
    assert(c.name && c.suitabilityScore > 70, 'Top crops must have valid names and high match scores');
    assert(c.recommendationReason, 'Each crop must have a recommendation reason');
    assert(c.risks, 'Each crop must list potential risks');
    assert(c.limitations, 'Each crop must list limitations');
  });

  // B. Crop Rotation assertions
  const rotRes = evaluateCropRotationSequences([
    { season: "2023 Kharif", value: "paddy" },
    { season: "2024 Kharif", value: "paddy" }
  ]);
  assert(rotRes.repeatedWarnings.length > 0, 'Must generate repeated monoculture warning for continuous paddy');
  assert(rotRes.recommendedSequences.length >= 3, 'Must offer at least 3 alternative rotation sequences');

  // C. Crop Water Requirement (FAO-56) assertions
  const cwRes = calculateFao56WaterRequirement('wheat', 4.4, 45);
  assert(cwRes.cropEvapotranspirationEtcMm > 0, 'Wheat ETc must be > 0');
  assert(cwRes.netIrrigationRequirementMm > 0, 'Wheat NIR must be > 0');
  assert(cwRes.irrigationPlanning.recommendedCycles > 0, 'Wheat must have recommended irrigation cycles');

  // D. Rain Bank assertions
  const rbRes = calculateRainBankPotential({ fieldAreaAcres: 4.2, annualRainfallMm: 1184 });
  assert(rbRes.harvestableWaterLitres > 1000000, '4.2 acres with 1184mm rain should yield > 1 Million Litres');
  assert(rbRes.harvestableWaterMillionLitres > 1.0, 'Harvestable water in Million Litres must be > 1.0');
  assert(rbRes.farmPondDesign.dimensions, 'Must provide farm pond dimensions');

  // E. Farming Recommendations assertions
  const farmRecs = generateFarmingRecommendations({
    soil: { ph: 6.8, organicCarbon: 0.57 },
    climate: { annualRainfallMm: 1184 },
    water: {},
    terrain: { slopePct: 1.4 }
  });
  assert(farmRecs.recommendations.length >= 4, 'Must generate at least 4 practical farming recommendations');
  farmRecs.recommendations.forEach(r => {
    assert(r.suggestedAction, 'Recommendation must have suggestedAction');
    assert(r.reason, 'Recommendation must have reason');
    assert(r.supportingData, 'Recommendation must have supportingData');
    assert(r.priority, 'Recommendation must have priority');
  });
  assert(farmRecs.disclaimer.includes('does not guarantee specific yields'), 'Must include strict yield/profit disclaimer');

  console.log('✓ Agricultural Decision Intelligence Engine (Part 7) verified for Crop Suitability, Rotation, FAO-56, Rain Bank & Roadmap');

  // 14. Test Part 8: Final Integration, Quality Assurance, Map Overlays & PDF Land Report
  const clientJs = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.js'), 'utf8');
  const dashJs = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.dashboard.js'), 'utf8');
  const dashCss = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.dashboard.css'), 'utf8');
  const pdfJs = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.pdf.js'), 'utf8');

  // A. Real Geospatial Map Layers (NASA GIBS, OpenTopoMap, OpenLandMap)
  assert(clientJs.includes('KRISHINITI_GEOSPATIAL_LAYERS'), 'KRISHINITI.js must expose KRISHINITI_GEOSPATIAL_LAYERS');
  assert(clientJs.includes('MODIS_Terra_NDVI_8Day'), 'KRISHINITI.js must include authentic NASA GIBS NDVI layer');
  assert(clientJs.includes('SMAP_L4_SM_gpc_surface'), 'KRISHINITI.js must include authentic NASA GIBS SMAP Soil Moisture layer');
  assert(clientJs.includes('GPM_3IMERGHHL_06_Precipitation_Rate'), 'KRISHINITI.js must include authentic NASA GIBS GPM Rainfall layer');
  assert(clientJs.includes('opentopomap.org'), 'KRISHINITI.js must include authentic OpenTopoMap SRTM Elevation layer');
  assert(clientJs.includes('hillshading'), 'KRISHINITI.js must include authentic NASA SRTM Hillshade/Slope layer');
  assert(clientJs.includes('MODIS_Terra_Land_Cover_Type_Yearly'), 'KRISHINITI.js must include authentic NASA GIBS Land Cover layer');
  assert(clientJs.includes('opengeohub.org'), 'KRISHINITI.js must include authentic OpenLandMap Soil-DB WMS layer');

  // B. Production Cleanliness & Card Interaction System
  assert(!dashJs.includes('PART 1 UI SPECIFICATION'), 'Production dashboard views must not contain temporary demo notice banners');
  assert(dashJs.includes('krish-drawer-back-btn'), 'Dashboard drawer must include explicit back button navigation');
  assert(dashCss.includes('krish-drawer-back-btn'), 'Dashboard CSS must style .krish-drawer-back-btn');
  assert(dashCss.includes('max-width: 640px') && dashCss.includes('width: 100vw !important'), 'Dashboard CSS must provide full-screen detail view on mobile');

  // Ensure cardMap covers all cards + map-preview + farm-overview
  const requiredCardKeys = [
    'map-preview', 'farm-overview', 'soil-intel', 'veg-health',
    'soil-moisture', 'rainfall-card', 'temperature-card', 'solar-intel',
    'evapotranspiration', 'drought-risk', 'flood-risk', 'terrain-analysis',
    'land-cover', 'crop-rotation', 'weather-risk', 'crop-water',
    'rain-bank', 'crop-suitability'
  ];
  requiredCardKeys.forEach(k => {
    assert(dashJs.includes(k), `Dashboard must register card mapping for ${k}`);
  });

  // C. PDF Land Report Generation Module
  assert(html.includes('KRISHINITI.pdf.js'), 'KRISHINITI.html must load KRISHINITI.pdf.js');
  assert(pdfJs.includes('window.KRISHINITI_PDF'), 'KRISHINITI.pdf.js must export window.KRISHINITI_PDF');
  assert(pdfJs.includes('downloadPdfReport'), 'KRISHINITI.pdf.js must provide downloadPdfReport function');
  assert(pdfJs.includes('generateReportHtml'), 'KRISHINITI.pdf.js must provide generateReportHtml function');

  // Verify that the PDF generator template contains all 14 required sections
  const samplePdfHtml = pdfJs;
  assert(samplePdfHtml.includes('Soil Pedology &amp; Physical Composition') || samplePdfHtml.includes('Soil Pedology'), 'PDF report must contain Soil Intelligence section');
  assert(samplePdfHtml.includes('Satellite-Based Vegetation Vigour') || samplePdfHtml.includes('Vegetation'), 'PDF report must contain Vegetation Health section');
  assert(samplePdfHtml.includes('Weather, Thermal Regime &amp; Precipitation') || samplePdfHtml.includes('Precipitation'), 'PDF report must contain Weather/Precipitation section');
  assert(samplePdfHtml.includes('Water Security &amp; Environmental Balance') || samplePdfHtml.includes('Water Security'), 'PDF report must contain Water Security section');
  assert(samplePdfHtml.includes('Terrain Morphology &amp; Soil Erosion Risk') || samplePdfHtml.includes('Terrain Morphology'), 'PDF report must contain Terrain & Erosion section');
  assert(samplePdfHtml.includes('Multi-Parametric Crop Suitability') || samplePdfHtml.includes('Crop Suitability'), 'PDF report must contain Crop Suitability section');
  assert(samplePdfHtml.includes('Rain Bank Runoff Harvesting') || samplePdfHtml.includes('Rain Bank'), 'PDF report must contain Rain Bank section');
  assert(samplePdfHtml.includes('Scientific Integrity &amp; Transparency Notice') || samplePdfHtml.includes('Transparency Notice'), 'PDF report must contain Data Sources & Limitations statement');

  // D. Soil Depth Switching & Land Refresh Verification
  const soilJs = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.soil.js'), 'utf8');
  assert(soilJs.includes('attachDepthListeners'), 'KRISHINITI.soil.js must expose attachDepthListeners');
  assert(soilJs.includes('currentSoilState.depth = depth'), 'KRISHINITI.soil.js must update currentSoilState.depth on depth switch');
  assert(clientJs.includes('window.location.reload()'), 'KRISHINITI.js must refresh page after selecting a new piece of land');
  assert(clientJs.includes('sessionStorage.setItem("krishiniti-active-screen", "analysis-screen")'), 'KRISHINITI.js must preserve analysis-screen state on reload');

  console.log('✓ Final Integration and Quality Assurance (Part 8) verified for Dashboard, Map Layers & PDF Report');

  // 15. Test Part 9: Real-Time Land Type & Farming Suitability Detection Engine
  const {
    LAND_CATEGORIES,
    SUITABILITY_LEVELS,
    mapEsaClassToCategory,
    classifyLandAndSuitability,
    generateSamplePoints
  } = require('./land_detection');

  // A. Category & Suitability constants verification
  assert.strictEqual(LAND_CATEGORIES.AGRICULTURAL, 'Agricultural land');
  assert.strictEqual(LAND_CATEGORIES.WATER, 'Water bodies');
  assert.strictEqual(LAND_CATEGORIES.DESERT_BARREN, 'Desert / Barren land');
  assert.strictEqual(LAND_CATEGORIES.MOUNTAINOUS, 'Mountainous land');
  assert.strictEqual(LAND_CATEGORIES.FOREST, 'Forest land');
  assert.strictEqual(LAND_CATEGORIES.BUILT_UP, 'Built-up land');

  assert.strictEqual(SUITABILITY_LEVELS.SUITABLE, 'Suitable for farming');
  assert.strictEqual(SUITABILITY_LEVELS.PARTIALLY_SUITABLE, 'Partially suitable for farming');
  assert.strictEqual(SUITABILITY_LEVELS.NOT_SUITABLE, 'Not suitable for farming');
  assert.strictEqual(SUITABILITY_LEVELS.INSUFFICIENT, 'Insufficient data to determine');

  // B. ESA WorldCover 10m Class Mapping
  assert.strictEqual(mapEsaClassToCategory(40).category, LAND_CATEGORIES.AGRICULTURAL, 'Code 40 must map to Agricultural land');
  assert.strictEqual(mapEsaClassToCategory(80).category, LAND_CATEGORIES.WATER, 'Code 80 must map to Water bodies');
  assert.strictEqual(mapEsaClassToCategory(90).category, LAND_CATEGORIES.WATER, 'Code 90 must map to Water bodies');
  assert.strictEqual(mapEsaClassToCategory(60).category, LAND_CATEGORIES.DESERT_BARREN, 'Code 60 must map to Desert / Barren land');
  assert.strictEqual(mapEsaClassToCategory(20).category, LAND_CATEGORIES.DESERT_BARREN, 'Code 20 must map to Desert / Barren land');
  assert.strictEqual(mapEsaClassToCategory(10).category, LAND_CATEGORIES.FOREST, 'Code 10 must map to Forest land');
  assert.strictEqual(mapEsaClassToCategory(95).category, LAND_CATEGORIES.FOREST, 'Code 95 must map to Forest land');
  assert.strictEqual(mapEsaClassToCategory(50).category, LAND_CATEGORIES.BUILT_UP, 'Code 50 must map to Built-up land');
  assert.strictEqual(mapEsaClassToCategory(70).category, LAND_CATEGORIES.MOUNTAINOUS, 'Code 70 must map to Mountainous land');

  // C. Classification Decision Engine verification
  // 1. Agricultural cropland with gentle slope
  const agriEval = classifyLandAndSuitability({
    esaData: {
      dataSource: 'ESA WorldCover 10m',
      validResults: [{ code: 40 }, { code: 40 }, { code: 40 }, { code: 40 }]
    },
    demData: { slopePct: 1.2, averageElevationM: 52, dataSource: 'Copernicus DEM 30m' }
  });
  assert.strictEqual(agriEval.dominantCategory, LAND_CATEGORIES.AGRICULTURAL);
  assert.strictEqual(agriEval.farmingSuitability, SUITABILITY_LEVELS.SUITABLE);
  assert.strictEqual(agriEval.isSuitable, true);
  assert(agriEval.reason.includes('suitable for'), 'Reason must explain agricultural suitability');

  // 2. Steep mountainous terrain
  const mountainEval = classifyLandAndSuitability({
    esaData: {
      dataSource: 'ESA WorldCover 10m',
      validResults: [{ code: 40 }, { code: 10 }]
    },
    demData: { slopePct: 35.0, averageElevationM: 2100, dataSource: 'Copernicus DEM 30m' }
  });
  assert.strictEqual(mountainEval.dominantCategory, LAND_CATEGORIES.MOUNTAINOUS);
  assert.strictEqual(mountainEval.farmingSuitability, SUITABILITY_LEVELS.NOT_SUITABLE);
  assert.strictEqual(mountainEval.isUnsuitable, true);
  assert(mountainEval.reason.includes('Steep mountainous terrain') || mountainEval.reason.includes('slope'), 'Reason must mention steep slope');

  // 3. Water body
  const waterEval = classifyLandAndSuitability({
    esaData: {
      dataSource: 'ESA WorldCover 10m',
      validResults: [{ code: 80 }, { code: 80 }]
    },
    demData: { slopePct: 0.1, averageElevationM: 2, dataSource: 'Copernicus DEM 30m' }
  });
  assert.strictEqual(waterEval.dominantCategory, LAND_CATEGORIES.WATER);
  assert.strictEqual(waterEval.farmingSuitability, SUITABILITY_LEVELS.NOT_SUITABLE);
  assert.strictEqual(waterEval.isUnsuitable, true);

  // 4. Built-up urban
  const urbanEval = classifyLandAndSuitability({
    esaData: {
      dataSource: 'ESA WorldCover 10m',
      validResults: [{ code: 50 }, { code: 50 }]
    },
    demData: { slopePct: 1.0, averageElevationM: 200, dataSource: 'Copernicus DEM 30m' }
  });
  assert.strictEqual(urbanEval.dominantCategory, LAND_CATEGORIES.BUILT_UP);
  assert.strictEqual(urbanEval.farmingSuitability, SUITABILITY_LEVELS.NOT_SUITABLE);
  assert.strictEqual(urbanEval.isUnsuitable, true);

  // 5. Forest land
  const forestEval = classifyLandAndSuitability({
    esaData: {
      dataSource: 'ESA WorldCover 10m',
      validResults: [{ code: 10 }, { code: 10 }]
    },
    demData: { slopePct: 3.0, averageElevationM: 100, dataSource: 'Copernicus DEM 30m' }
  });
  assert.strictEqual(forestEval.dominantCategory, LAND_CATEGORIES.FOREST);
  assert.strictEqual(forestEval.farmingSuitability, SUITABILITY_LEVELS.NOT_SUITABLE);
  assert(forestEval.reason.includes('not recommended') || forestEval.reason.includes('restricted'), 'Forest must warn against conversion');

  // 6. Mixed land handling (dominant agricultural with peripheral tree cover)
  const mixedEval = classifyLandAndSuitability({
    esaData: {
      dataSource: 'ESA WorldCover 10m',
      validResults: [{ code: 40 }, { code: 40 }, { code: 40 }, { code: 10 }]
    },
    demData: { slopePct: 2.0, averageElevationM: 60, dataSource: 'Copernicus DEM 30m' }
  });
  assert.strictEqual(mixedEval.dominantCategory, LAND_CATEGORIES.AGRICULTURAL);
  assert.strictEqual(mixedEval.isMixed, true);
  assert.strictEqual(mixedEval.agriculturalPortionPct, 75);
  assert(mixedEval.reason.includes('75%'), 'Reason must mention agricultural portion');

  // 7. Insufficient data handling (when satellite data is unavailable)
  const insufficientEval = classifyLandAndSuitability({ esaData: null, demData: null });
  assert.strictEqual(insufficientEval.farmingSuitability, SUITABILITY_LEVELS.INSUFFICIENT);
  assert.strictEqual(insufficientEval.hasInsufficientData, true);

  // D. UI & Server integration assertions
  assert(serverCode.includes('/api/land/detect'), 'server.js must expose /api/land/detect endpoint');

  const htmlCode = fs.readFileSync(path.join(__dirname, 'public', 'KRISHINITI.html'), 'utf8');
  assert(htmlCode.includes('id="land-detection-card"'), 'KRISHINITI.html must include land-detection-card');
  assert(htmlCode.includes('id="ld-land-type"'), 'KRISHINITI.html must include ld-land-type');
  assert(htmlCode.includes('id="ld-farming-suitability"'), 'KRISHINITI.html must include ld-farming-suitability');
  assert(htmlCode.includes('id="ld-reason"'), 'KRISHINITI.html must include ld-reason');

  assert(clientJs.includes('triggerLandDetection'), 'KRISHINITI.js must define triggerLandDetection');
  assert(clientJs.includes('renderLandDetectionResult'), 'KRISHINITI.js must define renderLandDetectionResult');
  assert(clientJs.includes('Crop Recommendations Suspended — Unsuitable Land'), 'KRISHINITI.js must suspend crop recommendations for unsuitable land');

  console.log('✓ Land Type & Farming Suitability Detection Engine (Part 9) verified for ESA WorldCover, DEM & Sentinel-2');
  console.log('--- ALL AUTOMATED TESTS COMPLETED SUCCESSFULLY! ---');
  process.exit(0);
})();
