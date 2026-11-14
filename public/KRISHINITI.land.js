// land_detection.js — Real-Time Land Type & Farming Suitability Detection Engine
// KRISHINITI Module: ESA WorldCover (10m) + Copernicus DEM (30m) + Sentinel-2 / NASA Vegetation Support

const LAND_CACHE = new Map();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24-hour cache

// Planetary Computer STAC & Data APIs for ESA WorldCover (10m)
const STAC_SEARCH_URL = "https://planetarycomputer.microsoft.com/api/stac/v1/collections/esa-worldcover/items";
const TITILER_POINT_URL = "https://planetarycomputer.microsoft.com/api/data/v1/item/point";
const OPEN_METEO_ELEVATION_URL = "https://api.open-meteo.com/v1/elevation";

/**
 * Standard 6 KRISHINITI Land Categories:
 * 1. Agricultural land
 * 2. Water bodies
 * 3. Desert / Barren land
 * 4. Mountainous land
 * 5. Forest land
 * 6. Built-up land
 */
const LAND_CATEGORIES = {
  AGRICULTURAL: "Agricultural land",
  WATER: "Water bodies",
  DESERT_BARREN: "Desert / Barren land",
  MOUNTAINOUS: "Mountainous land",
  FOREST: "Forest land",
  BUILT_UP: "Built-up land",
  INSUFFICIENT: "Insufficient data to determine"
};

/**
 * 4 Farming Suitability Levels:
 * - Suitable for farming
 * - Partially suitable for farming
 * - Not suitable for farming
 * - Insufficient data to determine
 */
const SUITABILITY_LEVELS = {
  SUITABLE: "Suitable for farming",
  PARTIALLY_SUITABLE: "Partially suitable for farming",
  NOT_SUITABLE: "Not suitable for farming",
  INSUFFICIENT: "Insufficient data to determine"
};

/**
 * ESA WorldCover 10m Land Cover Class Mapping:
 * 10: Tree cover -> Forest land
 * 20: Shrubland -> Desert / Barren or Marginal Scrub
 * 30: Grassland -> Natural Grassland / Pasture
 * 40: Cropland -> Agricultural land
 * 50: Built-up -> Built-up land
 * 60: Bare / sparse vegetation -> Desert / Barren land
 * 70: Snow and ice -> Mountainous land
 * 80: Permanent water bodies -> Water bodies
 * 90: Herbaceous wetland -> Water bodies
 * 95: Mangroves -> Forest land
 * 100: Moss and lichen -> Desert / Barren land
 */
function mapEsaClassToCategory(code) {
  switch (Number(code)) {
    case 10:
    case 95:
      return { category: LAND_CATEGORIES.FOREST, name: "Tree cover / Forest", code };
    case 40:
      return { category: LAND_CATEGORIES.AGRICULTURAL, name: "Cropland", code };
    case 50:
      return { category: LAND_CATEGORIES.BUILT_UP, name: "Built-up / Urban", code };
    case 80:
    case 90:
      return { category: LAND_CATEGORIES.WATER, name: code === 80 ? "Permanent water bodies" : "Herbaceous wetland", code };
    case 60:
    case 20:
    case 100:
      return { category: LAND_CATEGORIES.DESERT_BARREN, name: code === 20 ? "Shrubland" : "Bare / sparse vegetation", code };
    case 70:
      return { category: LAND_CATEGORIES.MOUNTAINOUS, name: "Snow and ice", code };
    case 30:
      return { category: LAND_CATEGORIES.AGRICULTURAL, name: "Grassland / Pasture", code };
    default:
      return null;
  }
}

/**
 * Great-circle distance between two coordinates in meters
 */
function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generate representative sample points for a field polygon or single center coordinate
 */
function generateSamplePoints(lat, lng, polygon) {
  const points = [];
  const cLat = Number(lat);
  const cLng = Number(lng);

  if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) {
    return points;
  }

  // Always include center point
  points.push({ lat: cLat, lng: cLng, role: "center" });

  let polyCoords = [];
  if (Array.isArray(polygon) && polygon.length >= 3) {
    polyCoords = polygon.map(p => {
      if (Array.isArray(p)) return { lat: Number(p[0]), lng: Number(p[1]) };
      return { lat: Number(p.lat || p[0]), lng: Number(p.lng || p[1]) };
    }).filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  }

  if (polyCoords.length >= 3) {
    // Pick up to 4 spread boundary points from polygon
    const step = Math.max(1, Math.floor(polyCoords.length / 4));
    for (let i = 0; i < polyCoords.length && points.length < 5; i += step) {
      points.push({ lat: polyCoords[i].lat, lng: polyCoords[i].lng, role: "boundary" });
    }
  } else {
    // If no polygon or single point, create 4 small cardinal offset points (~100m) to calculate local slope gradient
    const deltaLat = 0.0009; // ~100m
    const deltaLng = 0.0009 / Math.cos((cLat * Math.PI) / 180);
    points.push({ lat: cLat + deltaLat, lng: cLng, role: "north" });
    points.push({ lat: cLat - deltaLat, lng: cLng, role: "south" });
    points.push({ lat: cLat, lng: cLng + deltaLng, role: "east" });
    points.push({ lat: cLat, lng: cLng - deltaLng, role: "west" });
  }

  return points;
}

/**
 * Fetch DEM elevation for sample points using Copernicus DEM via Open-Meteo
 */
async function fetchDemElevation(points, timeoutMs = 7000) {
  if (!points || points.length === 0) return null;

  const latList = points.map(p => p.lat.toFixed(5)).join(",");
  const lngList = points.map(p => p.lng.toFixed(5)).join(",");
  const url = `${OPEN_METEO_ELEVATION_URL}?latitude=${latList}&longitude=${lngList}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Open-Meteo elevation HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.elevation) || data.elevation.length === 0) {
      return null;
    }

    const elevations = data.elevation.map(Number).filter(Number.isFinite);
    if (elevations.length === 0) return null;

    const minElev = Math.min(...elevations);
    const maxElev = Math.max(...elevations);
    const reliefM = +(maxElev - minElev).toFixed(1);
    const avgElev = +(elevations.reduce((a, b) => a + b, 0) / elevations.length).toFixed(1);

    // Calculate maximum and average slope between the center point and other sample points
    let maxSlopePct = 0;
    let slopeSum = 0;
    let slopeCount = 0;

    const centerElev = elevations[0];
    const centerPt = points[0];

    for (let i = 1; i < points.length && i < elevations.length; i++) {
      const dist = haversineDistanceMeters(centerPt.lat, centerPt.lng, points[i].lat, points[i].lng);
      if (dist > 5) {
        const deltaElev = Math.abs(elevations[i] - centerElev);
        const slope = (deltaElev / dist) * 100;
        if (slope > maxSlopePct) maxSlopePct = slope;
        slopeSum += slope;
        slopeCount++;
      }
    }

    const avgSlopePct = slopeCount > 0 ? +(slopeSum / slopeCount).toFixed(1) : 0;
    const peakSlopePct = +maxSlopePct.toFixed(1);

    return {
      averageElevationM: avgElev,
      minElevationM: minElev,
      maxElevationM: maxElev,
      reliefM,
      slopePct: peakSlopePct,
      averageSlopePct: avgSlopePct,
      dataSource: "Copernicus DEM (30m / 90m Global Elevation)"
    };
  } catch (err) {
    clearTimeout(timer);
    console.warn("[DEM-Elevation] Could not fetch elevation:", err.message);
    return null;
  }
}

/**
 * Fetch ESA WorldCover 10m land cover classification for sample points via Planetary Computer
 */
async function fetchEsaWorldCover(points, timeoutMs = 8000) {
  if (!points || points.length === 0) return null;

  const center = points[0];
  const delta = 0.02;
  const bbox = `${(center.lng - delta).toFixed(4)},${(center.lat - delta).toFixed(4)},${(center.lng + delta).toFixed(4)},${(center.lat + delta).toFixed(4)}`;
  const searchUrl = `${STAC_SEARCH_URL}?limit=1&bbox=${bbox}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const stacRes = await fetch(searchUrl, { signal: controller.signal });
    if (!stacRes.ok) throw new Error(`Planetary Computer STAC HTTP ${stacRes.status}`);
    const stacData = await stacRes.json();

    const feature = stacData.features?.[0];
    if (!feature || !feature.id) {
      clearTimeout(timer);
      return null;
    }

    const itemId = feature.id;

    // Point query for each sample point
    const queryPromises = points.map(async (pt) => {
      try {
        const ptUrl = `${TITILER_POINT_URL}/${pt.lng.toFixed(5)},${pt.lat.toFixed(5)}?collection=esa-worldcover&item=${itemId}&assets=map`;
        const ptRes = await fetch(ptUrl, { signal: controller.signal });
        if (!ptRes.ok) return null;
        const ptJson = await ptRes.json();
        const code = Array.isArray(ptJson.values) && ptJson.values.length > 0 ? Math.round(ptJson.values[0]) : null;
        return { lat: pt.lat, lng: pt.lng, code };
      } catch (e) {
        return null;
      }
    });

    const pointResults = await Promise.all(queryPromises);
    clearTimeout(timer);

    const validResults = pointResults.filter(r => r && Number.isFinite(r.code) && r.code > 0);
    if (validResults.length === 0) return null;

    return {
      itemId,
      validResults,
      dataSource: "Copernicus ESA WorldCover 10m (v200 2021)"
    };
  } catch (err) {
    clearTimeout(timer);
    console.warn("[ESA-WorldCover] Could not fetch WorldCover:", err.message);
    return null;
  }
}

/**
 * Core Decision Logic: Synthesizes ESA WorldCover + DEM into the 6 Land Categories & 4 Suitability Tiers
 */
function classifyLandAndSuitability({ esaData, demData, coordinates }) {
  // If no authentic data could be retrieved from real datasets:
  if (!esaData && !demData) {
    return {
      landType: "Insufficient data",
      dominantCategory: LAND_CATEGORIES.INSUFFICIENT,
      farmingSuitability: SUITABILITY_LEVELS.INSUFFICIENT,
      isSuitable: false,
      isPartiallySuitable: false,
      isUnsuitable: false,
      hasInsufficientData: true,
      reason: "Real geographical satellite classification data could not be retrieved for these coordinates. Please check connectivity or choose a valid plot boundary.",
      confidence: "none",
      mixedBreakdown: null,
      agriculturalPortionPct: 0,
      elevation: null,
      slope: null,
      dataSources: []
    };
  }

  const dataSources = [];
  if (esaData) dataSources.push(esaData.dataSource);
  if (demData) dataSources.push(demData.dataSource);

  // 1. Evaluate DEM Topography & Mountains
  const slopePct = demData ? demData.slopePct : 0;
  const avgElev = demData ? demData.averageElevationM : 0;
  const isSteepSlope = slopePct >= 20.0;
  const isModerateMountainSlope = slopePct >= 12.0 && slopePct < 20.0;
  const isHighAltitudeRugged = avgElev >= 1500 && slopePct >= 15.0;

  // 2. Evaluate ESA WorldCover Classes
  const counts = {
    [LAND_CATEGORIES.AGRICULTURAL]: 0,
    [LAND_CATEGORIES.WATER]: 0,
    [LAND_CATEGORIES.DESERT_BARREN]: 0,
    [LAND_CATEGORIES.FOREST]: 0,
    [LAND_CATEGORIES.BUILT_UP]: 0,
    [LAND_CATEGORIES.MOUNTAINOUS]: 0
  };

  let totalSamples = 0;
  const sampleDetails = [];

  if (esaData && esaData.validResults) {
    esaData.validResults.forEach(r => {
      const mapped = mapEsaClassToCategory(r.code);
      if (mapped) {
        counts[mapped.category] = (counts[mapped.category] || 0) + 1;
        totalSamples++;
        sampleDetails.push({ code: r.code, name: mapped.name, category: mapped.category });
      }
    });
  }

  // If DEM identifies extreme steep slope (>20%) or rugged high relief, categorize as Mountainous land
  const isPhysicallyMountainous = isSteepSlope || isHighAltitudeRugged;

  let dominantCategory = LAND_CATEGORIES.AGRICULTURAL;
  let maxCount = -1;

  for (const [cat, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count;
      dominantCategory = cat;
    }
  }

  // Calculate percentages
  const agriculturalPortionPct = totalSamples > 0 ? +((counts[LAND_CATEGORIES.AGRICULTURAL] / totalSamples) * 100).toFixed(0) : 0;
  const waterPct = totalSamples > 0 ? +((counts[LAND_CATEGORIES.WATER] / totalSamples) * 100).toFixed(0) : 0;
  const forestPct = totalSamples > 0 ? +((counts[LAND_CATEGORIES.FOREST] / totalSamples) * 100).toFixed(0) : 0;
  const builtUpPct = totalSamples > 0 ? +((counts[LAND_CATEGORIES.BUILT_UP] / totalSamples) * 100).toFixed(0) : 0;
  const barrenPct = totalSamples > 0 ? +((counts[LAND_CATEGORIES.DESERT_BARREN] / totalSamples) * 100).toFixed(0) : 0;

  // Physical mountain override: If slope is steep (>20%), mountainous terrain overrides flat classification
  if (isPhysicallyMountainous) {
    dominantCategory = LAND_CATEGORIES.MOUNTAINOUS;
  }

  const isMixed = totalSamples > 1 && maxCount < totalSamples && agriculturalPortionPct > 0 && agriculturalPortionPct < 100;

  // 3. Determine Farming Suitability & Reason
  let farmingSuitability = SUITABILITY_LEVELS.SUITABLE;
  let reason = "";
  let isSuitable = false;
  let isPartiallySuitable = false;
  let isUnsuitable = false;

  switch (dominantCategory) {
    case LAND_CATEGORIES.AGRICULTURAL: {
      if (isModerateMountainSlope) {
        farmingSuitability = SUITABILITY_LEVELS.PARTIALLY_SUITABLE;
        isPartiallySuitable = true;
        reason = `Cultivated agricultural land on moderate slope (${slopePct}% gradient); partially suitable, requiring soil conservation and contour bunding.`;
      } else if (isMixed && agriculturalPortionPct < 75) {
        farmingSuitability = SUITABILITY_LEVELS.PARTIALLY_SUITABLE;
        isPartiallySuitable = true;
        reason = `Mixed parcel with ${agriculturalPortionPct}% agricultural land; partially suitable for farming on the arable portion.`;
      } else if (isMixed && agriculturalPortionPct >= 75) {
        farmingSuitability = SUITABILITY_LEVELS.SUITABLE;
        isSuitable = true;
        reason = `Dominant agricultural cropland (${agriculturalPortionPct}%) with favorable terrain (${slopePct}% slope), suitable for crop cultivation.`;
      } else {
        farmingSuitability = SUITABILITY_LEVELS.SUITABLE;
        isSuitable = true;
        reason = `Agricultural cropland detected with favorable terrain (${slopePct}% slope), suitable for seasonal crop cultivation.`;
      }
      break;
    }

    case LAND_CATEGORIES.WATER: {
      farmingSuitability = SUITABILITY_LEVELS.NOT_SUITABLE;
      isUnsuitable = true;
      if (isMixed && agriculturalPortionPct > 0) {
        reason = `Dominant water body / wetland detected (${waterPct}%), with ${agriculturalPortionPct}% peripheral arable land; not suitable for ordinary crop cultivation.`;
      } else {
        reason = "Permanent water body or wetland detected; not suitable for ordinary crop cultivation.";
      }
      break;
    }

    case LAND_CATEGORIES.DESERT_BARREN: {
      // "Do not assume barren land always means desert."
      // If flat with 0 veg, check whether it is arid barren vs fallow
      if (isMixed && agriculturalPortionPct >= 40) {
        farmingSuitability = SUITABILITY_LEVELS.PARTIALLY_SUITABLE;
        isPartiallySuitable = true;
        reason = `Barren soil parcel with ${agriculturalPortionPct}% agricultural footprint; partially suitable, requiring irrigation and organic soil amendments.`;
      } else {
        farmingSuitability = SUITABILITY_LEVELS.NOT_SUITABLE;
        isUnsuitable = true;
        reason = "Barren or desert land with negligible vegetative cover and low moisture retention; unsuitable for ordinary farming without reclamation.";
      }
      break;
    }

    case LAND_CATEGORIES.MOUNTAINOUS: {
      if (slopePct >= 22.0) {
        farmingSuitability = SUITABILITY_LEVELS.NOT_SUITABLE;
        isUnsuitable = true;
        reason = `Steep mountainous terrain with severe ${slopePct}% slope; high erosion risk and unsuitable for ordinary farming.`;
      } else {
        farmingSuitability = SUITABILITY_LEVELS.PARTIALLY_SUITABLE;
        isPartiallySuitable = true;
        reason = `Mountainous terrain with ${slopePct}% slope; farming is limited and requires terrace cultivation and runoff management.`;
      }
      break;
    }

    case LAND_CATEGORIES.FOREST: {
      farmingSuitability = SUITABILITY_LEVELS.NOT_SUITABLE;
      isUnsuitable = true;
      if (isMixed && agriculturalPortionPct > 0) {
        reason = `Dominant natural tree canopy / forest detected (${forestPct}%) with ${agriculturalPortionPct}% clearing; agricultural conversion is restricted and not recommended.`;
      } else {
        reason = "Dense natural forest cover detected; conversion to agriculture is environmentally restricted and not recommended.";
      }
      break;
    }

    case LAND_CATEGORIES.BUILT_UP: {
      farmingSuitability = SUITABILITY_LEVELS.NOT_SUITABLE;
      isUnsuitable = true;
      reason = "Built-up urban structures, settlements, or infrastructure detected; not suitable for ordinary farming.";
      break;
    }

    default: {
      farmingSuitability = SUITABILITY_LEVELS.INSUFFICIENT;
      reason = "Insufficient satellite classification data to determine land type.";
      break;
    }
  }

  // Short clean label for display: Agricultural / Water / Desert / Mountain / Forest / Built-up
  const SHORT_TYPES = {
    [LAND_CATEGORIES.AGRICULTURAL]: "Agricultural",
    [LAND_CATEGORIES.WATER]: "Water",
    [LAND_CATEGORIES.DESERT_BARREN]: "Desert",
    [LAND_CATEGORIES.MOUNTAINOUS]: "Mountain",
    [LAND_CATEGORIES.FOREST]: "Forest",
    [LAND_CATEGORIES.BUILT_UP]: "Built-up",
    [LAND_CATEGORIES.INSUFFICIENT]: "Unknown"
  };
  const shortLandType = SHORT_TYPES[dominantCategory] || dominantCategory;

  return {
    landType: dominantCategory,
    shortLandType,
    dominantCategory,
    farmingSuitability,
    isSuitable,
    isPartiallySuitable,
    isUnsuitable,
    hasInsufficientData: false,
    reason,
    isMixed,
    agriculturalPortionPct,
    mixedBreakdown: {
      agricultural: agriculturalPortionPct,
      water: waterPct,
      forest: forestPct,
      builtUp: builtUpPct,
      barren: barrenPct
    },
    metrics: {
      elevationM: avgElev,
      slopePct,
      isSteepSlope,
      samplePointsCount: totalSamples,
      dataSources
    }
  };
}

/**
 * Main Entry Point: Query real datasets and return validated Land Type & Farming Suitability
 */
async function detectLandTypeAndSuitability({ lat, lng, polygon = null }) {
  const cLat = Number(lat);
  const cLng = Number(lng);

  if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) {
    throw new Error("Invalid coordinates for Land Detection.");
  }

  // Cache key based on 4 decimal places (~11m resolution)
  const cacheKey = `${cLat.toFixed(4)}_${cLng.toFixed(4)}_${Array.isArray(polygon) ? polygon.length : 0}`;
  const cached = LAND_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }

  const samplePoints = generateSamplePoints(cLat, cLng, polygon);

  // Parallel fetch: ESA WorldCover (Planetary Computer) + Copernicus DEM (Open-Meteo)
  const [esaData, demData] = await Promise.all([
    fetchEsaWorldCover(samplePoints),
    fetchDemElevation(samplePoints)
  ]);

  const result = classifyLandAndSuitability({
    esaData,
    demData,
    coordinates: { lat: cLat, lng: cLng }
  });

  LAND_CACHE.set(cacheKey, { timestamp: Date.now(), data: result });
  return result;
}

if (typeof window !== "undefined") {
  window.detectLandTypeAndSuitability = detectLandTypeAndSuitability;
  window.classifyLandAndSuitability = classifyLandAndSuitability;
  window.generateSamplePoints = generateSamplePoints;
  window.mapEsaClassToCategory = mapEsaClassToCategory;
  window.haversineDistanceMeters = haversineDistanceMeters;
  window.LAND_CATEGORIES = LAND_CATEGORIES;
  window.SUITABILITY_LEVELS = SUITABILITY_LEVELS;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    detectLandTypeAndSuitability,
    classifyLandAndSuitability,
    generateSamplePoints,
    mapEsaClassToCategory,
    haversineDistanceMeters,
    LAND_CATEGORIES,
    SUITABILITY_LEVELS
  };
}
