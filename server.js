// server.js
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { GoogleGenAI, Type } = require("@google/genai");

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS and generous JSON limit for rich farm and forecast payload
app.use(cors());
app.use(express.json({ limit: "500kb" }));

// Rate Limiter: Max 20 AI explanation requests per 15 minutes per IP
const aiExplainLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Rate limit reached (max 20 AI explanations per 15 minutes). Your verified deterministic report remains fully available above.",
    errorHi: "अनुरोध सीमा समाप्त हो गई है (प्रति 15 मिनट अधिकतम 20 AI व्याख्याएं)। आपकी सत्यापित कृषि रिपोर्ट ऊपर पूरी तरह उपलब्ध है।"
  }
});

// Candidate models in order of priority (fast/reliable models first to absorb high-demand spikes)
const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.8-flash"
].filter(Boolean);

// Strict System Prompt locking the AI to verified JSON inputs only
function buildSystemInstruction(lang) {
  const languageRule =
    lang === "hi"
      ? "Write every field in simple, respectful, conversational Hindi (Devanagari script) suitable for smallholder farmers. Explain technical terms simply."
      : "Write every field in simple, clear, everyday English suitable for smallholder farmers. Avoid dense academic jargon.";

  return `You are the grounded explanation layer for KRISHINITI, an evidence-based agricultural decision-support system.
Your ONLY job is to explain the already-computed, deterministic results provided in the JSON input.

STRICT ANTI-HALLUCINATION RULES (NEVER VIOLATE):
1. DO NOT invent, estimate, or extrapolate crop suitability, weather forecasts, soil chemical properties, crop yields (kg/quintals per acre), market prices, or official government/IMD warnings.
2. DO NOT perform independent agronomic calculations. Rely 100% on the numbers, statuses, and checks inside the provided JSON payload.
3. Explicitly distinguish between historical NASA POWER observations (past climate), Open-Meteo 7-day model forecasts (uncertain outlook), ISRIC SoilGrids 250m statistical estimates, and demonstration soil placeholders.
4. For precautions, suggest ONLY measures explicitly present in the supplied "cropSuitability", "rotationStressTest", or "weatherRiskEvaluation" objects.
5. ${languageRule}`;
}

// Structured JSON Schema guaranteeing all 5 required sections are returned cleanly
const explanationResponseSchema = {
  type: Type.OBJECT,
  properties: {
    whyRecommended: {
      type: Type.STRING,
      description: "Plain-language explanation of why the top-suited crop(s) matched or were constrained based strictly on the rule-based water, soil, and rotation checks."
    },
    rotationTradeOffs: {
      type: Type.STRING,
      description: "Comparison of Plan A, Plan B, and Plan C from rotationStressTest, explaining water demand vs NASA rainfall, duration, and soil-health trade-offs."
    },
    missingInfoAndUncertainties: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "List of missing data, unverified soil parameters, and model uncertainties explicitly identified in the input payload."
    },
    supportedPrecautions: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Practical precautions strictly supported by the supplied ICAR/FAO/Open-Meteo evidence and growth-stage checks."
    },
    whenToConsultLocalExperts: {
      type: Type.STRING,
      description: "Clear guidance on when the farmer must visit their local Krishi Vigyan Kendra (KVK), soil testing lab, or block agriculture officer."
    }
  },
  required: [
    "whyRecommended",
    "rotationTradeOffs",
    "missingInfoAndUncertainties",
    "supportedPrecautions",
    "whenToConsultLocalExperts"
  ]
};

// Root route handler serving KRISHINITI.html
app.get(["/", "/index.html"], (req, res) => {
  res.sendFile(path.join(__dirname, "public", "KRISHINITI.html"));
});

// OpenLandMap Soil-DB integration
const { getOpenLandMapSoilData } = require("./openlandmap");
const { getFarmProfileIntelligence } = require("./farm_profile_intelligence");

// Farm Profile Auto-Detection & Shifting Probe endpoint
app.get("/api/farm/probe", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({
      status: "error",
      error: "Valid latitude (-90 to 90) and longitude (-180 to 180) are required."
    });
  }

  try {
    const crop = req.query.crop ? String(req.query.crop).toLowerCase().trim() : null;
    const soilType = req.query.soilType ? String(req.query.soilType).trim() : null;
    const water = req.query.water ? String(req.query.water).trim() : null;
    const priority = req.query.priority ? String(req.query.priority).trim() : null;
    const probeData = await getFarmProfileIntelligence({ lat, lng, crop, soilType, water, priority });
    return res.json(probeData);
  } catch (error) {
    console.error("Farm Profile Probe API error:", error.message);
    return res.status(500).json({
      status: "error",
      error: "Failed to probe field intelligence.",
      details: error.message
    });
  }
});

// OpenLandMap Soil-DB endpoint: Coordinate-based soil intelligence
app.get("/api/soil/openlandmap", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const depth = req.query.depth || "0-30";
    let polygon = null;

    if (req.query.polygon) {
      try {
        polygon = JSON.parse(req.query.polygon);
      } catch (e) {
        // Ignore parse error
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid floating point numbers."
      });
    }

    const soilData = await getOpenLandMapSoilData({ lat, lng, polygon, depth });
    return res.json(soilData);
  } catch (err) {
    console.error("OpenLandMap Soil API error:", err.message);
    return res.status(503).json({
      error: "OpenLandMap Soil-DB service is currently unavailable or coordinates are outside coverage.",
      details: err.message,
      dataSource: "OpenLandMap Soil-DB",
      stacCatalog: "https://stac.opengeohub.org/v1/cat/openlandmap",
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/soil/openlandmap", async (req, res) => {
  try {
    const { lat, lng, polygon, depth = "0-30" } = req.body || {};
    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid numbers."
      });
    }

    const soilData = await getOpenLandMapSoilData({ lat: centerLat, lng: centerLng, polygon, depth });
    return res.json(soilData);
  } catch (err) {
    console.error("OpenLandMap Soil API error:", err.message);
    return res.status(503).json({
      error: "OpenLandMap Soil-DB service is currently unavailable or coordinates are outside coverage.",
      details: err.message,
      dataSource: "OpenLandMap Soil-DB",
      stacCatalog: "https://stac.opengeohub.org/v1/cat/openlandmap",
      timestamp: new Date().toISOString()
    });
  }
});

// Soil Diagnostic: Health Card Upload & Extraction & Nearby Laboratory Locator
const {
  processSoilReportUpload,
  getNearbySoilLaboratories
} = require("./soil_diagnostic_service");

// Upload and extract Soil Health Card / laboratory test report
app.post("/api/soil/extract-report", express.json({ limit: "5mb" }), async (req, res) => {
  try {
    const { fileBase64, mimeType, fileName, fileSize, ocrText } = req.body || {};
    if (!fileBase64) {
      return res.status(400).json({
        error: "Missing document payload. Please provide fileBase64 data."
      });
    }

    const result = await processSoilReportUpload({ fileBase64, mimeType, fileName, fileSize, ocrText });
    if (result.status === "error") {
      const statusCode = result.code === "FILE_TOO_LARGE" ? 413 : 400;
      return res.status(statusCode).json(result);
    }

    return res.json(result);
  } catch (err) {
    console.error("Soil Report Extraction API error:", err.message);
    return res.status(500).json({
      status: "error",
      error: "Internal server error while analyzing soil report.",
      details: err.message
    });
  }
});

// Locates verified nearby testing facilities with straight-line distance
app.get("/api/soil/nearby-labs", (req, res) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat) : null;
    const lng = req.query.lng ? parseFloat(req.query.lng) : null;
    const district = req.query.district || null;
    const maxCount = req.query.limit ? parseInt(req.query.limit, 10) : 10;

    const result = getNearbySoilLaboratories({ lat, lng, district, maxCount });
    return res.json(result);
  } catch (err) {
    console.error("Nearby Soil Labs API error:", err.message);
    return res.status(500).json({
      status: "error",
      error: "Failed to locate nearby soil laboratories.",
      details: err.message
    });
  }
});

// Satellite-Based Vegetation Intelligence (NASA MODIS / HLS)
const { getSatelliteVegetationData } = require("./nasa_vegetation");

app.get("/api/vegetation/nasa", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const date = req.query.date || null;
    let polygon = null;

    if (req.query.polygon) {
      try {
        polygon = JSON.parse(req.query.polygon);
      } catch (e) {
        // Ignore parse error
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid floating point numbers."
      });
    }

    const vegData = await getSatelliteVegetationData({ lat, lng, polygon, selectedDate: date });
    return res.json(vegData);
  } catch (err) {
    console.error("NASA Vegetation API error:", err.message);
    return res.status(503).json({
      error: "NASA MODIS / Vegetation service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/vegetation/nasa", async (req, res) => {
  try {
    const { lat, lng, polygon, date = null } = req.body || {};
    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid numbers."
      });
    }

    const vegData = await getSatelliteVegetationData({ lat: centerLat, lng: centerLng, polygon, selectedDate: date });
    return res.json(vegData);
  } catch (err) {
    console.error("NASA Vegetation API error:", err.message);
    return res.status(503).json({
      error: "NASA MODIS / Vegetation service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

const { getNasaPowerHistory, REQUESTED_PARAMETERS: NASA_POWER_HISTORY_PARAMETERS } = require("./nasa_power_history");
const { analyzeClimateHistory } = require("./analytics_history");
const { buildClimateActionPlan } = require("./action_plan");

app.get("/api/climate/history", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({
      status: "unavailable",
      error: "Valid latitude (-90 to 90) and longitude (-180 to 180) are required.",
      source: "NASA POWER Daily Point API",
      parameters: NASA_POWER_HISTORY_PARAMETERS,
      retrievedAt: new Date().toISOString()
    });
  }

  try {
    const history = await getNasaPowerHistory({ lat, lng });
    return res.json(history);
  } catch (error) {
    console.error("NASA POWER Climate History API error:", error.message);
    return res.status(503).json({
      status: "unavailable",
      error: "NASA data unavailable.",
      details: error.message,
      source: "NASA POWER Daily Point API",
      parameters: NASA_POWER_HISTORY_PARAMETERS,
      retrievedAt: new Date().toISOString()
    });
  }
});

app.get("/api/climate/analysis", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
      !Number.isFinite(lng) || lng < -180 || lng > 180) {
    return res.status(400).json({
      status: "unavailable",
      error: "Valid latitude (-90 to 90) and longitude (-180 to 180) are required.",
      source: "NASA POWER Daily Point API",
      retrievedAt: new Date().toISOString()
    });
  }

  let practice = [];
  if (req.query.practice) {
    try {
      practice = JSON.parse(req.query.practice);
      if (!Array.isArray(practice) || practice.some(item =>
        !item || typeof item.id !== "string" || (item.year !== undefined && !Number.isInteger(Number(item.year))))) {
        return res.status(400).json({ status: "unavailable", error: "Practice must be an array of crop IDs and optional years." });
      }
    } catch (error) {
      return res.status(400).json({ status: "unavailable", error: "Practice must be valid JSON." });
    }
  }

  try {
    const history = await getNasaPowerHistory({ lat, lng });
    const analysis = analyzeClimateHistory(history);
    const durationParam = req.query.duration && !isNaN(Number(req.query.duration)) ? Number(req.query.duration) : null;
    const waterAccess = req.query.scenario || req.query.water || req.query.waterAccess || null;
    const goalsParam = req.query.goals ? req.query.goals : null;
    let labSoil = null;
    if (req.query.labSoil) {
      try {
        labSoil = typeof req.query.labSoil === 'string' ? JSON.parse(req.query.labSoil) : req.query.labSoil;
      } catch (e) {}
    }
    const farmContext = {
      waterAccess,
      waterSource: req.query.waterSource || null,
      soilType: req.query.soilType || null,
      soilTest: req.query.soilTest || null,
      labSoil,
      area: req.query.area ? Number(req.query.area) : null,
      goals: goalsParam,
      farmName: req.query.farmName || null
    };
    const actionPlan = buildClimateActionPlan(history, analysis, practice, durationParam, farmContext);
    return res.json({
      ...analysis,
      provenance: {
        status: history.status === "live" ? "LIVE" : "CACHED",
        source: history.source,
        parameters: history.parameters,
        retrievedAt: history.retrievedAt
      },
      actionPlan
    });
  } catch (error) {
    console.error("NASA POWER Climate Analysis API error:", error.message);
    return res.status(503).json({
      status: "unavailable",
      error: "NASA data unavailable.",
      details: error.message,
      source: "NASA POWER Daily Point API",
      parameters: NASA_POWER_HISTORY_PARAMETERS,
      retrievedAt: new Date().toISOString()
    });
  }
});


const {
  generateLandAnalysisRotations,
  buildActionPlanModificationReview
} = require("./crop_rotation_engine");

// Dynamic Land-Analysis-Driven Crop Rotations API (Re-rankable across 6 farmer priorities)
app.get("/api/action-plan/dynamic-rotations", async (req, res) => {
  try {
    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({ error: "Valid lat and lng are required." });
    }

    const { findAgroEcologicalZone } = require("./farm_profile_intelligence");
    const zone = findAgroEcologicalZone(lat, lng);

    let labSoil = null;
    if (req.query.labSoil) {
      try { labSoil = typeof req.query.labSoil === "string" ? JSON.parse(req.query.labSoil) : req.query.labSoil; } catch (e) {}
    }

    const priority = req.query.priority || "balanced";
    const scenario = req.query.scenario || req.query.waterAccess || "rainfed";

    const soilContext = {
      ph: labSoil?.ph ?? (req.query.ph ? Number(req.query.ph) : (zone?.id?.includes("gangetic") ? 7.2 : 6.8)),
      soc: labSoil?.soc ?? (req.query.soc ? Number(req.query.soc) : 0.65),
      clay: req.query.clay ? Number(req.query.clay) : (zone?.id?.includes("gangetic") ? 24.7 : 28),
      sand: req.query.sand ? Number(req.query.sand) : (zone?.id?.includes("gangetic") ? 52 : 45),
      provenance: labSoil ? "LAB_VERIFIED" : "SATELLITE_MODEL",
      verifiedLabSoil: labSoil
    };

    const result = generateLandAnalysisRotations({
      lat,
      lng,
      zone,
      soil: soilContext,
      targetScenario: scenario,
      priority,
      targetCount: 28
    });

    return res.json(result);
  } catch (err) {
    console.error("Dynamic Rotations API error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Review proposed modifications before updating existing Action Plan
app.post("/api/action-plan/review-modification", express.json(), (req, res) => {
  try {
    const { selectedRotation, existingActionPlan, farmProfile } = req.body || {};
    if (!selectedRotation || !selectedRotation.sequence) {
      return res.status(400).json({ error: "Selected rotation is required." });
    }
    const review = buildActionPlanModificationReview(selectedRotation, existingActionPlan || {}, farmProfile || {});
    return res.json(review);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Weather and Climate Intelligence (NASA GPM IMERG, NASA POWER, Open-Meteo)
const { getClimateIntelligence, getWeeklyWeatherRisk } = require("./weather_climate");

app.get("/api/climate/nasa", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid floating point numbers."
      });
    }

    const climateData = await getClimateIntelligence({ lat, lng });
    return res.json(climateData);
  } catch (err) {
    console.error("NASA Climate API error:", err.message);
    return res.status(503).json({
      error: "NASA Climate / GPM IMERG service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/climate/nasa", async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid numbers."
      });
    }

    const climateData = await getClimateIntelligence({ lat: centerLat, lng: centerLng });
    return res.json(climateData);
  } catch (err) {
    console.error("NASA Climate API error:", err.message);
    return res.status(503).json({
      error: "NASA Climate / GPM IMERG service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.get("/api/weather/forecast", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid floating point numbers."
      });
    }

    const forecastData = await getWeeklyWeatherRisk({ lat, lng });
    return res.json(forecastData);
  } catch (err) {
    console.error("Weather Forecast API error:", err.message);
    return res.status(503).json({
      error: "Weather Forecast service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/weather/forecast", async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid numbers."
      });
    }

    const forecastData = await getWeeklyWeatherRisk({ lat: centerLat, lng: centerLng });
    return res.json(forecastData);
  } catch (err) {
    console.error("Weather Forecast API error:", err.message);
    return res.status(503).json({
      error: "Weather Forecast service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Water and Environmental Intelligence (NASA SMAP, MODIS MOD16, Water Balance, Drought & Flood)
const { getWaterEnvironmentalIntelligence } = require("./water_environmental");

app.get("/api/water/intelligence", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    let polygon = null;

    if (req.query.polygon) {
      try {
        polygon = JSON.parse(req.query.polygon);
      } catch (e) {
        // Ignore JSON parse error
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid floating point numbers."
      });
    }

    const waterData = await getWaterEnvironmentalIntelligence({ lat, lng, polygon });
    return res.json(waterData);
  } catch (err) {
    console.error("Water Intelligence API error:", err.message);
    return res.status(503).json({
      error: "Water and Environmental Intelligence service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/water/intelligence", async (req, res) => {
  try {
    const { lat, lng, polygon } = req.body || {};
    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid numbers."
      });
    }

    const waterData = await getWaterEnvironmentalIntelligence({ lat: centerLat, lng: centerLng, polygon });
    return res.json(waterData);
  } catch (err) {
    console.error("Water Intelligence API error:", err.message);
    return res.status(503).json({
      error: "Water and Environmental Intelligence service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Terrain and Land-Use Intelligence (NASA SRTM 30m, Indicative RUSLE & Multi-Year Land Cover)
const { getTerrainLandUseIntelligence } = require("./terrain_landuse");

app.get("/api/terrain/analysis", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    let polygon = null;

    if (req.query.polygon) {
      try {
        polygon = JSON.parse(req.query.polygon);
      } catch (e) {
        // Ignore JSON parse error
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid floating point numbers."
      });
    }

    const terrainData = await getTerrainLandUseIntelligence({ lat, lng, polygon });
    return res.json(terrainData);
  } catch (err) {
    console.error("Terrain Analysis API error:", err.message);
    return res.status(503).json({
      error: "Terrain & Land-Use Intelligence service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/terrain/analysis", async (req, res) => {
  try {
    const { lat, lng, polygon } = req.body || {};
    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid numbers."
      });
    }

    const terrainData = await getTerrainLandUseIntelligence({ lat: centerLat, lng: centerLng, polygon });
    return res.json(terrainData);
  } catch (err) {
    console.error("Terrain Analysis API error:", err.message);
    return res.status(503).json({
      error: "Terrain & Land-Use Intelligence service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Real-Time Land Type & Farming Suitability Detection (ESA WorldCover 10m & Copernicus DEM 30m)
const { detectLandTypeAndSuitability } = require("./land_detection");

app.get("/api/land/detect", async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    let polygon = null;

    if (req.query.polygon) {
      try {
        polygon = JSON.parse(req.query.polygon);
      } catch (e) {
        // Ignore JSON parse error
      }
    }

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid numbers."
      });
    }

    const landData = await detectLandTypeAndSuitability({ lat, lng, polygon });
    return res.json(landData);
  } catch (err) {
    console.error("Land Detection API error:", err.message);
    return res.status(503).json({
      error: "Land detection service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

app.post("/api/land/detect", async (req, res) => {
  try {
    const { lat, lng, polygon = null } = req.body || {};
    const centerLat = parseFloat(lat);
    const centerLng = parseFloat(lng);

    if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) {
      return res.status(400).json({
        error: "Invalid coordinates. Both lat and lng must be valid numbers."
      });
    }

    const landData = await detectLandTypeAndSuitability({ lat: centerLat, lng: centerLng, polygon });
    return res.json(landData);
  } catch (err) {
    console.error("Land Detection API error:", err.message);
    return res.status(503).json({
      error: "Land detection service is currently unavailable.",
      details: err.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Agricultural Decision Intelligence Engine (Part 7)
const {
  evaluateCropSuitability,
  evaluateCropRotationSequences,
  calculateFao56WaterRequirement,
  calculateRainBankPotential,
  generateFarmingRecommendations,
  CROP_CATALOG
} = require("./decision_intelligence");

// Crop Suitability endpoint
app.get("/api/decision/suitability", (req, res) => {
  try {
    const ph = parseFloat(req.query.ph) || 6.8;
    const soc = parseFloat(req.query.soc) || 0.57;
    const texture = req.query.texture || "Loam";
    const rain = parseFloat(req.query.rain) || 1184;
    let prevCrops = [];
    if (req.query.previousCrops) {
      try { prevCrops = JSON.parse(req.query.previousCrops); } catch (e) {}
    }

    const suitability = evaluateCropSuitability({
      soil: { ph, organicCarbon: soc, texture },
      climate: { annualRainfallMm: rain },
      previousCrops: prevCrops
    });

    return res.json(suitability);
  } catch (err) {
    console.error("Crop Suitability API error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Crop Water Requirement (FAO-56) endpoint
app.get("/api/decision/water-requirement", (req, res) => {
  try {
    const cropId = req.query.crop || "wheat";
    const et0 = parseFloat(req.query.et0) || 4.4;
    const rain = parseFloat(req.query.rain) || 65;

    const waterReq = calculateFao56WaterRequirement(cropId, et0, rain);
    return res.json(waterReq);
  } catch (err) {
    console.error("Water Requirement API error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Rain Bank Runoff Harvesting endpoint
app.get("/api/decision/rain-bank", (req, res) => {
  try {
    const area = parseFloat(req.query.area) || 4.2;
    const rain = parseFloat(req.query.rain) || 1184;
    const coeff = parseFloat(req.query.runoff) || 0.20;
    const eff = parseFloat(req.query.efficiency) || 0.85;

    const rainBank = calculateRainBankPotential({
      fieldAreaAcres: area,
      annualRainfallMm: rain,
      runoffCoefficient: coeff,
      collectionEfficiency: eff
    });

    return res.json(rainBank);
  } catch (err) {
    console.error("Rain Bank API error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Unified Decision Evaluation & Farming Recommendations endpoint
app.post("/api/decision/evaluate", (req, res) => {
  try {
    const {
      soil = { ph: 6.8, organicCarbon: 0.57, texture: "Loam" },
      climate = { annualRainfallMm: 1184 },
      water = {},
      terrain = { slopePct: 1.4 },
      previousCrops = [],
      fieldAreaAcres = 4.2,
      lat = 25.7512,
      lng = 86.0241,
      priority = "balanced"
    } = req.body || {};

    const suitability = evaluateCropSuitability({ soil, climate, water, previousCrops });
    const rotation = evaluateCropRotationSequences(previousCrops, { soil, climate, water, lat, lng, priority });
    const rainBank = calculateRainBankPotential({ fieldAreaAcres, annualRainfallMm: climate.annualRainfallMm });
    const recommendations = generateFarmingRecommendations({ soil, climate, water, terrain });

    return res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      suitability,
      rotation,
      rainBank,
      recommendations,
      cropCatalog: CROP_CATALOG
    });
  } catch (err) {
    console.error("Decision Evaluation API error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    service: "KRISHINITI",
    aiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString()
  });
});

// Serve static frontend assets from ./public
app.use(express.static(path.join(__dirname, "public")));

// AI Explanation endpoint with resilient model fallback and exponential backoff
app.post("/api/explain", aiExplainLimiter, async (req, res) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({
        error: "AI service is not configured on this server. You can continue using KRISHINITI without AI.",
        errorHi: "इस सर्वर पर AI सेवा कॉन्फ़िगर नहीं है। आप बिना AI के KRISHINITI का उपयोग जारी रख सकते हैं।"
      });
    }

    const { language = "en", structuredInput } = req.body || {};

    // Verify that deterministic engine results are present before calling the LLM
    if (
      !structuredInput ||
      !structuredInput.cropSuitability ||
      !structuredInput.rotationStressTest ||
      !structuredInput.sourcesAndUncertainties
    ) {
      return res.status(400).json({
        error: "Incomplete decision engine payload. Run 'Analyse Crop Options' first.",
        errorHi: "अधूरा डेटा। कृपया पहले 'फसल विकल्पों का विश्लेषण करें' चलाएँ।"
      });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const contents = [
      {
        role: "user",
        parts: [
          {
            text: `Explain this verified KRISHINITI decision engine payload without adding any external facts or calculations:\n${JSON.stringify(structuredInput)}`
          }
        ]
      }
    ];

    const config = {
      systemInstruction: buildSystemInstruction(language === "hi" ? "hi" : "en"),
      temperature: 0.1,
      responseMimeType: "application/json",
      responseSchema: explanationResponseSchema
    };

    // Try candidate models in order to absorb transient 503s or high-demand spikes
    let response = null;
    let selectedModel = null;
    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const generatePromise = ai.models.generateContent({ model, contents, config });
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Model ${model} request timed out after 20s`)), 20000)
        );

        response = await Promise.race([generatePromise, timeoutPromise]);
        selectedModel = model;
        break; // Success!
      } catch (err) {
        console.warn(`KRISHINITI Model [${model}] attempt failed: ${err.message}. Trying next fallback model...`);
        lastError = err;
        // If 503 High Demand, wait 800ms before trying the next fallback
        if (err.message && (err.message.includes("503") || err.message.includes("high demand"))) {
          await new Promise(r => setTimeout(r, 800));
        }
      }
    }

    if (!response) {
      throw lastError || new Error("All AI candidate models failed to generate content.");
    }

    // Strip markdown code fences if present before parsing
    const rawText = (response.text || "")
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "");

    const parsedExplanation = JSON.parse(rawText);

    return res.status(200).json({
      status: "ok",
      language: language === "hi" ? "hi" : "en",
      generatedAt: new Date().toISOString(),
      modelUsed: selectedModel,
      explanation: parsedExplanation
    });
  } catch (err) {
    console.error("KRISHINITI AI Explanation Error:", err.message);
    const isTimeout = err.message && err.message.includes("timed out");
    return res.status(502).json({
      error: isTimeout
        ? "AI explanation request timed out. Your verified rule-based results above remain accurate."
        : "AI explanation could not be generated right now. Your verified rule-based results above remain accurate.",
      errorHi: isTimeout
        ? "AI व्याख्या समय सीमा समाप्त हो गई। ऊपर दिए गए आपके नियम-आधारित परिणाम पूरी तरह सटीक हैं।"
        : "अभी AI व्याख्या उत्पन्न नहीं हो सकी। ऊपर दिए गए आपके नियम-आधारित परिणाम पूरी तरह सटीक हैं।"
    });
  }
});

// Start Express server
const server = app.listen(PORT, () => {
  console.log(`KRISHINITI server running at http://localhost:${PORT}`);
});

module.exports = { app, server };
