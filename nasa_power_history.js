const fs = require("fs/promises");
const path = require("path");

const NASA_POWER_DAILY_URL = "https://power.larc.nasa.gov/api/temporal/daily/point";
const NASA_POWER_COMMUNITY = "AG";
const REQUESTED_PARAMETERS = [
  "T2M",
  "T2M_MAX",
  "T2M_MIN",
  "PRECTOTCORR",
  "ALLSKY_SFC_SW_DWN",
  "RH2M",
  "WS2M",
  "GWETROOT",
  "GWETTOP"
];
const HISTORY_START_YEAR = 1981;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 60000;
const DEFAULT_CACHE_DIR = path.join(__dirname, "cache");

function dateToYmd(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function ymdToIso(ymd) {
  return `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
}

function makeChunks(endDate) {
  const endYear = endDate.getUTCFullYear();
  const chunks = [];
  for (let startYear = HISTORY_START_YEAR; startYear <= endYear; startYear += 10) {
    const chunkStart = new Date(Date.UTC(startYear, 0, 1));
    const chunkEnd = new Date(Date.UTC(Math.min(startYear + 9, endYear), 11, 31));
    if (chunkEnd > endDate) chunkEnd.setTime(endDate.getTime());
    chunks.push({ start: dateToYmd(chunkStart), end: dateToYmd(chunkEnd) });
  }
  return chunks;
}

function cacheFilePath(cacheDir, lat, lng) {
  return path.join(cacheDir, `nasa-power-history_${lat.toFixed(4)}_${lng.toFixed(4)}.json`);
}

function isFreshCache(data, now) {
  const retrievedAtMs = Date.parse(data?.retrievedAt);
  return Number.isFinite(retrievedAtMs) && now.getTime() - retrievedAtMs < CACHE_TTL_MS &&
    now.getTime() >= retrievedAtMs;
}

function withStatus(data, status) {
  return { ...data, status };
}

function normalizeValue(value, fillValue) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric === fillValue || numeric === -999) return null;
  return numeric;
}

async function requestChunk({ chunk, lat, lng, parameters, fetchImpl, timeoutMs }) {
  const query = new URLSearchParams({
    parameters: parameters.join(","),
    community: NASA_POWER_COMMUNITY,
    longitude: lng.toFixed(4),
    latitude: lat.toFixed(4),
    start: chunk.start,
    end: chunk.end,
    format: "JSON",
    "time-standard": "UTC"
  });
  const url = `${NASA_POWER_DAILY_URL}?${query.toString()}`;
  let lastError;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        headers: { Accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) {
        throw new Error(`NASA POWER returned HTTP ${response.status}`);
      }
      const payload = await response.json();
      const parameterData = payload?.properties?.parameter;
      if (!parameterData || typeof parameterData !== "object") {
        throw new Error("NASA POWER response is missing properties.parameter.");
      }
      return payload;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error(`NASA POWER failed for ${chunk.start}-${chunk.end} after one retry: ${lastError.message}`);
}

function appendChunk(payload, mergedValues, metadata, messages, returnedParameters, fillValues) {
  const properties = payload.properties || {};
  const parameterData = properties.parameter || {};
  const header = payload.header || {};
  const fillValue = Number.isFinite(Number(header.fill_value)) ? Number(header.fill_value) : -999;
  fillValues.add(fillValue);

  for (const [parameter, values] of Object.entries(parameterData)) {
    if (!REQUESTED_PARAMETERS.includes(parameter) || !values || typeof values !== "object") continue;
    returnedParameters.add(parameter);
    if (payload.parameters?.[parameter]) metadata.set(parameter, payload.parameters[parameter]);
    for (const [date, value] of Object.entries(values)) {
      if (!/^\d{8}$/.test(date)) continue;
      if (!mergedValues.has(date)) mergedValues.set(date, {});
      mergedValues.get(date)[parameter] = normalizeValue(value, fillValue);
    }
  }

  for (const message of payload.messages || []) {
    if (typeof message === "string" && message.trim()) messages.add(message.trim());
  }
}

function buildDailySeries(mergedValues, availableParameters) {
  let latestDate = null;
  for (const [date, values] of mergedValues) {
    if (availableParameters.some(parameter => values[parameter] !== null && values[parameter] !== undefined)) {
      if (latestDate === null || date > latestDate) latestDate = date;
    }
  }
  if (!latestDate) throw new Error("NASA POWER returned no valid daily data for the requested period.");

  const start = new Date(Date.UTC(HISTORY_START_YEAR, 0, 1));
  const end = new Date(Date.UTC(
    Number(latestDate.slice(0, 4)),
    Number(latestDate.slice(4, 6)) - 1,
    Number(latestDate.slice(6, 8))
  ));
  const expectedDayCount = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const missingCounts = Object.fromEntries(REQUESTED_PARAMETERS.map(parameter => [parameter, 0]));
  const daily = [];

  for (let timestamp = start.getTime(); timestamp <= end.getTime(); timestamp += 86400000) {
    const date = dateToYmd(new Date(timestamp));
    const stored = mergedValues.get(date) || {};
    const row = { date: ymdToIso(date) };
    for (const parameter of availableParameters) {
      const value = stored[parameter] ?? null;
      row[parameter] = value;
      if (value === null) missingCounts[parameter] += 1;
    }
    for (const parameter of REQUESTED_PARAMETERS) {
      if (!availableParameters.includes(parameter)) missingCounts[parameter] += 1;
    }
    daily.push(row);
  }

  const missingPct = Object.fromEntries(REQUESTED_PARAMETERS.map(parameter => [
    parameter,
    +((missingCounts[parameter] / expectedDayCount) * 100).toFixed(2)
  ]));

  return {
    latestDate: ymdToIso(latestDate),
    daily,
    missingPct,
    expectedDayCount
  };
}

function createNasaPowerHistoryService({
  cacheDir = DEFAULT_CACHE_DIR,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  timeoutMs = REQUEST_TIMEOUT_MS
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("A fetch implementation is required.");
  const memoryCache = new Map();

  async function getHistory({ lat, lng }) {
    const centerLat = Number(lat);
    const centerLng = Number(lng);
    if (!Number.isFinite(centerLat) || centerLat < -90 || centerLat > 90 ||
        !Number.isFinite(centerLng) || centerLng < -180 || centerLng > 180) {
      throw new Error("Invalid coordinates for NASA POWER history.");
    }

    const roundedLat = Number(centerLat.toFixed(4));
    const roundedLng = Number(centerLng.toFixed(4));
    const key = `${roundedLat.toFixed(4)}_${roundedLng.toFixed(4)}`;
    const currentTime = now();
    const inMemory = memoryCache.get(key);
    if (inMemory && isFreshCache(inMemory, currentTime)) return withStatus(inMemory, "cached");

    const filePath = cacheFilePath(cacheDir, roundedLat, roundedLng);
    let fileContents;
    let diskData = null;
    try {
      fileContents = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`Unable to read NASA POWER cache: ${error.message}`);
    }
    if (fileContents) {
      try {
        diskData = JSON.parse(fileContents);
        diskData = JSON.parse(fileContents);
      } catch (error) {
        throw new Error(`NASA POWER cache file is invalid JSON: ${error.message}`);
      }
      if (isFreshCache(diskData, currentTime)) {
        memoryCache.set(key, diskData);
        return withStatus(diskData, "cached");
      }
    }

    const mergedValues = new Map();
    const metadata = new Map();
    const messages = new Set();
    const returnedParameters = new Set();
    const fillValues = new Set();
    const endDate = new Date(Date.UTC(
      currentTime.getUTCFullYear(),
      currentTime.getUTCMonth(),
      currentTime.getUTCDate()
    ));

    try {
      for (const chunk of makeChunks(endDate)) {
        const payload = await requestChunk({
          chunk,
          lat: roundedLat,
          lng: roundedLng,
          parameters: REQUESTED_PARAMETERS,
          fetchImpl,
          timeoutMs
        });
        appendChunk(payload, mergedValues, metadata, messages, returnedParameters, fillValues);
      }
    } catch (liveError) {
      if (diskData) {
        console.warn(`NASA POWER live query failed, falling back to disk cache for ${key}:`, liveError.message);
        memoryCache.set(key, diskData);
        return withStatus(diskData, "cached");
      }
      try {
        const files = await fs.readdir(cacheDir);
        let nearest = null;
        let minDist = Infinity;
        for (const file of files) {
          const m = file.match(/^nasa-power-history_(-?\d+\.\d+)_(-?\d+\.\d+)\.json$/);
          if (m) {
            const fLat = parseFloat(m[1]);
            const fLng = parseFloat(m[2]);
            const dist = Math.hypot(fLat - roundedLat, fLng - roundedLng);
            if (dist < minDist) {
              minDist = dist;
              nearest = { file, lat: fLat, lng: fLng };
            }
          }
        }
        if (nearest && minDist <= 20.0) {
          const raw = await fs.readFile(path.join(cacheDir, nearest.file), "utf8");
          const parsed = JSON.parse(raw);
          console.warn(`NASA POWER live query failed, using nearest cached point (${nearest.lat}, ${nearest.lng}) for ${key}`);
          return withStatus(parsed, "cached");
        }
      } catch (fallbackError) {}
      throw liveError;
    }

    const parameters = REQUESTED_PARAMETERS
      .filter(parameter => returnedParameters.has(parameter))
      .map(name => ({
        name,
        units: metadata.get(name)?.units || null,
        longname: metadata.get(name)?.longname || null
      }));
    const unavailableParameters = REQUESTED_PARAMETERS.filter(parameter => !returnedParameters.has(parameter));
    const series = buildDailySeries(mergedValues, parameters.map(parameter => parameter.name));
    const retrievedAt = now().toISOString();
    const result = {
      status: "live",
      source: "NASA POWER Daily Point API",
      community: NASA_POWER_COMMUNITY,
      coordinates: { lat: roundedLat, lng: roundedLng },
      period: { start: "1981-01-01", end: series.latestDate },
      retrievedAt,
      requestedParameters: [...REQUESTED_PARAMETERS],
      parameters,
      unavailableParameters,
      messages: [...messages],
      fillValues: [...fillValues],
      missingPct: series.missingPct,
      expectedDayCount: series.expectedDayCount,
      daily: series.daily
    };

    await fs.mkdir(cacheDir, { recursive: true });
    const temporaryPath = `${filePath}.${process.pid}.tmp`;
    await fs.writeFile(temporaryPath, JSON.stringify(result), "utf8");
    await fs.rename(temporaryPath, filePath);
    memoryCache.set(key, result);
    return withStatus(result, "live");
  }

  return { getHistory };
}

const nasaPowerHistoryService = createNasaPowerHistoryService();

module.exports = {
  NASA_POWER_DAILY_URL,
  REQUESTED_PARAMETERS,
  CACHE_TTL_MS,
  createNasaPowerHistoryService,
  getNasaPowerHistory: nasaPowerHistoryService.getHistory
};
