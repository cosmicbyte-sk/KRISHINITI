const METRICS = {
  meanTemperatureC: { label: "Mean temperature", unit: "°C", parameter: "T2M", aggregation: "mean" },
  meanDailyMaximumC: { label: "Mean daily high", unit: "°C", parameter: "T2M_MAX", aggregation: "mean" },
  meanDailyMinimumC: { label: "Mean daily low", unit: "°C", parameter: "T2M_MIN", aggregation: "mean" },
  totalRainfallMm: { label: "Total rainfall", unit: "mm", parameter: "PRECTOTCORR", aggregation: "sum" },
  rainyDays: { label: "Rainy days (≥2.5 mm)", unit: "days", parameter: "PRECTOTCORR", aggregation: "rainyDays" },
  heavyRainDays: { label: "Heavy-rain days (≥10 mm)", unit: "days", parameter: "PRECTOTCORR", aggregation: "heavyRainDays" },
  solarRadiationMjM2: { label: "Mean daily solar radiation", unit: "MJ/m²/day", parameter: "ALLSKY_SFC_SW_DWN", aggregation: "mean" },
  relativeHumidityPct: { label: "Mean relative humidity", unit: "%", parameter: "RH2M", aggregation: "mean" },
  rootWetness: { label: "Mean root-zone wetness", unit: "0–1", parameter: "GWETROOT", aggregation: "mean" },
  surfaceWetness: { label: "Mean surface wetness", unit: "0–1", parameter: "GWETTOP", aggregation: "mean" },
  hotDaysAbove35C: { label: "Hot days above 35°C", unit: "days", parameter: "T2M_MAX", aggregation: "above35" },
  hotDaysAbove40C: { label: "Hot days above 40°C", unit: "days", parameter: "T2M_MAX", aggregation: "above40" },
  longestRainySeasonDrySpell: { label: "Longest rainy-season dry spell", unit: "days", parameter: "PRECTOTCORR", aggregation: "drySpell" },
  referenceEt0Mm: { label: "Reference ET₀ (Hargreaves)", unit: "mm", parameter: "T2M_MAX,T2M_MIN", aggregation: "sumEt0" },
  rainySeasonOnsetDoy: { label: "Rainy-season onset", unit: "day of year", parameter: "PRECTOTCORR", aggregation: "onset" }
};

const MIN_COVERAGE = 0.8;
const MIN_TREND_YEARS = 10;

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function erf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const approximation = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return sign * approximation;
}

function normalCdf(value) {
  return 0.5 * (1 + erf(value / Math.SQRT2));
}

function mannKendall(points) {
  const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  const n = valid.length;
  if (n < MIN_TREND_YEARS) return { pValue: null, significant: false, testable: false, n };

  let score = 0;
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      if (valid[j].y > valid[i].y) score += 1;
      else if (valid[j].y < valid[i].y) score -= 1;
    }
  }

  const tieCounts = new Map();
  for (const point of valid) tieCounts.set(point.y, (tieCounts.get(point.y) || 0) + 1);
  let tieCorrection = 0;
  for (const count of tieCounts.values()) {
    if (count > 1) tieCorrection += count * (count - 1) * (2 * count + 5);
  }
  const variance = (n * (n - 1) * (2 * n + 5) - tieCorrection) / 18;
  if (variance <= 0) return { pValue: 1, significant: false, testable: true, n, score };
  const z = score > 0 ? (score - 1) / Math.sqrt(variance) : score < 0 ? (score + 1) / Math.sqrt(variance) : 0;
  const pValue = Math.max(0, Math.min(1, 2 * (1 - normalCdf(Math.abs(z)))));
  return { pValue, significant: pValue < 0.05, testable: true, n, score };
}

function theilSenSlope(points) {
  const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  const slopes = [];
  for (let i = 0; i < valid.length - 1; i += 1) {
    for (let j = i + 1; j < valid.length; j += 1) {
      const deltaX = valid[j].x - valid[i].x;
      if (deltaX !== 0) slopes.push((valid[j].y - valid[i].y) / deltaX);
    }
  }
  return median(slopes);
}

function ols(points) {
  const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (valid.length < 2) return null;
  const meanX = valid.reduce((sum, point) => sum + point.x, 0) / valid.length;
  const meanY = valid.reduce((sum, point) => sum + point.y, 0) / valid.length;
  const denominator = valid.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
  if (denominator === 0) return null;
  const slope = valid.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0) / denominator;
  return {
    intercept: meanY - slope * meanX,
    slope,
    meanX,
    residualSumSquares: valid.reduce((sum, point) => sum + (point.y - (meanY + slope * (point.x - meanX))) ** 2, 0),
    n: valid.length,
    denominator
  };
}

function projectTrend(points, targetYear = 2035) {
  const valid = points.filter(point => Number.isFinite(point.x) && Number.isFinite(point.y));
  const test = mannKendall(valid);
  const theilSenPerDecade = theilSenSlope(valid);
  if (!test.significant || valid.length < MIN_TREND_YEARS) {
    return {
      status: test.testable ? "no significant trend" : "insufficient data",
      slopePerDecade: Number.isFinite(theilSenPerDecade) ? theilSenPerDecade * 10 : null,
      pValue: test.pValue,
      significant: false,
      targetYear,
      projection: null,
      interval80: null
    };
  }

  const fit = ols(valid);
  const lastYear = Math.max(...valid.map(point => point.x));
  const residualVariance = fit.n > 2 ? fit.residualSumSquares / (fit.n - 2) : 0;
  const standardError = Math.sqrt(residualVariance * (
    1 + 1 / fit.n + ((targetYear - fit.meanX) ** 2 / fit.denominator)
  ));
  const center = fit.intercept + fit.slope * targetYear;
  const margin = 1.2815515655446004 * standardError;
  return {
    status: "significant",
    slopePerDecade: theilSenPerDecade * 10,
    pValue: test.pValue,
    significant: true,
    targetYear,
    projection: center,
    interval80: { lower: center - margin, upper: center + margin },
    lastObservedYear: lastYear,
    method: "OLS extension with approximate 80% prediction interval"
  };
}

function validValue(row, parameter) {
  if (row[parameter] === null || row[parameter] === undefined || row[parameter] === "") return null;
  const value = Number(row[parameter]);
  return Number.isFinite(value) && value !== -999 ? value : null;
}

function getDayOfYear(date) {
  const current = new Date(`${date}T00:00:00Z`);
  const start = Date.UTC(current.getUTCFullYear(), 0, 1);
  return Math.floor((current.getTime() - start) / 86400000) + 1;
}

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function extraterrestrialRadiationMj(latitude, dayOfYear) {
  const latitudeRad = latitude * Math.PI / 180;
  const inverseDistance = 1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365);
  const declination = 0.409 * Math.sin(2 * Math.PI * dayOfYear / 365 - 1.39);
  const sunsetAngle = Math.acos(Math.max(-1, Math.min(1, -Math.tan(latitudeRad) * Math.tan(declination))));
  return (24 * 60 / Math.PI) * 0.0820 * inverseDistance * (
    sunsetAngle * Math.sin(latitudeRad) * Math.sin(declination) +
    Math.cos(latitudeRad) * Math.cos(declination) * Math.sin(sunsetAngle)
  );
}

function hargreavesEt0(row, latitude) {
  const tMax = validValue(row, "T2M_MAX");
  const tMin = validValue(row, "T2M_MIN");
  if (tMax === null || tMin === null || tMax < tMin) return null;
  const tMean = (tMax + tMin) / 2;
  const radiation = extraterrestrialRadiationMj(latitude, getDayOfYear(row.date)) * 0.408;
  return Math.max(0, 0.0023 * (tMean + 17.8) * Math.sqrt(tMax - tMin) * radiation);
}

function detectRainySeason(daily, latitude) {
  const monthSums = Array(12).fill(0);
  const monthCounts = Array(12).fill(0);
  for (const row of daily) {
    const rain = validValue(row, "PRECTOTCORR");
    if (rain === null) continue;
    const month = Number(row.date.slice(5, 7)) - 1;
    monthSums[month] += rain;
    monthCounts[month] += 1;
  }
  const meanMonthlyDailyRain = monthSums.map((sum, index) => monthCounts[index] ? sum / monthCounts[index] : null);
  let bestStart = null;
  let bestTotal = -Infinity;
  for (let start = 0; start < 12; start += 1) {
    const months = Array.from({ length: 4 }, (_, offset) => (start + offset) % 12);
    if (months.some(month => meanMonthlyDailyRain[month] === null)) continue;
    const total = months.reduce((sum, month) => sum + meanMonthlyDailyRain[month] * (month === 1 ? 28.25 : [3, 5, 8, 10].includes(month) ? 30 : 31), 0);
    if (total > bestTotal) {
      bestTotal = total;
      bestStart = start;
    }
  }
  if (bestStart === null) return { available: false, months: [], hemisphere: latitude < 0 ? "southern" : "northern" };
  return {
    available: true,
    months: Array.from({ length: 4 }, (_, offset) => (bestStart + offset) % 12),
    startMonth: bestStart + 1,
    hemisphere: latitude < 0 ? "southern" : "northern",
    meanRainfallMm: +bestTotal.toFixed(1)
  };
}

function metricValue(rows, metricId, rainyMonths, latitude, onsetThresholdMm) {
  const definition = METRICS[metricId];
  if (metricId === "rainySeasonOnsetDoy") {
    const rainyRows = rows.filter(row => rainyMonths.includes(Number(row.date.slice(5, 7)) - 1));
    for (let index = 0; index + 9 < rainyRows.length; index += 1) {
      const window = rainyRows.slice(index, index + 10);
      if (window.length !== 10 || window.some((row, i) => i > 0 &&
          Date.parse(`${row.date}T00:00:00Z`) - Date.parse(`${window[i - 1].date}T00:00:00Z`) !== 86400000)) continue;
      const rain = window.map(row => validValue(row, "PRECTOTCORR"));
      if (rain.some(value => value === null)) continue;
      if (rain.reduce((sum, value) => sum + value, 0) >= onsetThresholdMm) return getDayOfYear(window[0].date);
    }
    return null;
  }
  if (metricId === "longestRainySeasonDrySpell") {
    const rainyRows = rows.filter(row => rainyMonths.includes(Number(row.date.slice(5, 7)) - 1));
    let longest = 0;
    let current = 0;
    let previousDate = null;
    for (const row of rainyRows) {
      const rain = validValue(row, "PRECTOTCORR");
      const currentDate = Date.parse(`${row.date}T00:00:00Z`);
      if (previousDate !== null && currentDate - previousDate !== 86400000) current = 0;
      if (rain === null) current = 0;
      else if (rain < 2) {
        current += 1;
        longest = Math.max(longest, current);
      } else current = 0;
      previousDate = currentDate;
    }
    const validDays = rainyRows.filter(row => validValue(row, "PRECTOTCORR") !== null).length;
    return rainyRows.length && validDays / rainyRows.length >= MIN_COVERAGE ? longest : null;
  }

  const parameterNames = definition.parameter.split(",");
  const selected = rows.filter(row => parameterNames.every(parameter => validValue(row, parameter) !== null));
  if (!rows.length || selected.length / rows.length < MIN_COVERAGE) return null;
  if (metricId === "referenceEt0Mm") {
    const et0Values = selected.map(row => hargreavesEt0(row, latitude)).filter(Number.isFinite);
    return et0Values.length / rows.length >= MIN_COVERAGE
      ? +et0Values.reduce((sum, value) => sum + value, 0).toFixed(2) : null;
  }

  const values = selected.map(row => validValue(row, definition.parameter));
  switch (definition.aggregation) {
    case "sum": return +values.reduce((sum, value) => sum + value, 0).toFixed(2);
    case "rainyDays": return values.filter(value => value >= 2.5).length;
    case "heavyRainDays": return values.filter(value => value >= 10).length;
    case "above35": return values.filter(value => value > 35).length;
    case "above40": return values.filter(value => value > 40).length;
    default: return +(values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2);
  }
}

function buildYearSeries(daily, firstYear, lastYear, rainyMonths, latitude, onsetThresholdMm, months = null) {
  const byYear = new Map();
  for (let year = firstYear; year <= lastYear; year += 1) {
    const rows = daily.filter(row => Number(row.date.slice(0, 4)) === year &&
      (!months || months.includes(Number(row.date.slice(5, 7)) - 1)));
    const values = {};
    for (const metricId of Object.keys(METRICS)) {
      values[metricId] = metricValue(rows, metricId, rainyMonths, latitude, onsetThresholdMm);
    }
    byYear.set(year, { year, ...values });
  }
  return [...byYear.values()];
}

function movingAverage(series, metricId, windowSize = 5) {
  return series.map((point, index) => {
    const window = series.slice(Math.max(0, index - windowSize + 1), index + 1);
    const valid = window.map(item => item[metricId]).filter(Number.isFinite);
    return {
      year: point.year,
      value: window.length === windowSize && valid.length === windowSize
        ? +(valid.reduce((sum, value) => sum + value, 0) / windowSize).toFixed(2) : null
    };
  });
}

function summarizeMetric(series, metricId, baselineStart, baselineEnd, recentYears) {
  const baseline = series.filter(point => point.year >= baselineStart && point.year <= baselineEnd &&
    Number.isFinite(point[metricId])).map(point => point[metricId]);
  const recent = series.filter(point => recentYears.includes(point.year) && Number.isFinite(point[metricId]))
    .map(point => point[metricId]);
  const baselineMean = baseline.length ? baseline.reduce((sum, value) => sum + value, 0) / baseline.length : null;
  const recentMean = recent.length ? recent.reduce((sum, value) => sum + value, 0) / recent.length : null;
  const absoluteChange = baselineMean === null || recentMean === null ? null : recentMean - baselineMean;
  return {
    baseline: { startYear: baselineStart, endYear: baselineEnd, yearsAvailable: baseline.length, mean: baselineMean },
    recent: { years: recentYears, yearsAvailable: recent.length, mean: recentMean },
    absoluteChange,
    percentChange: baselineMean && absoluteChange !== null ? absoluteChange / Math.abs(baselineMean) * 100 : null,
    trend: projectTrend(series.map(point => ({ x: point.year, y: point[metricId] }))),
    movingAverage: movingAverage(series, metricId)
  };
}

function generateHeadline(summary, fieldName = null) {
  const metrics = summary?.metrics || {};
  const onset = metrics.rainySeasonOnsetDoy;
  const rain = metrics.totalRainfallMm;
  const drySpell = metrics.longestRainySeasonDrySpell;
  const temperature = metrics.meanTemperatureC;

  const locationLabel = fieldName || summary?.fieldName || summary?.location || "historical records";

  const candidates = [
    {
      id: "onset",
      priority: 0,
      significant: Boolean(onset?.trend?.significant),
      hasPracticalEffect: onset?.absoluteChange !== null && Math.abs(onset.absoluteChange) >= 3,
      statement: onset?.absoluteChange !== null
        ? `Rainy-season onset is shifting about ${Math.abs(onset.absoluteChange).toFixed(0)} days ${onset.absoluteChange > 0 ? "later" : "earlier"} in the recent period versus the baseline, with a statistically significant trend.`
        : null,
      notable: onset?.absoluteChange !== null && Math.abs(onset.absoluteChange) >= 1
        ? `onset ${onset.absoluteChange > 0 ? "+" : ""}${Math.round(onset.absoluteChange)} days`
        : null
    },
    {
      id: "rainfall",
      priority: 1,
      significant: Boolean(rain?.trend?.significant),
      hasPracticalEffect: rain?.percentChange !== null && Math.abs(rain.percentChange) >= 5,
      statement: rain?.percentChange !== null
        ? `Annual rainfall has ${rain.percentChange > 0 ? "increased" : "decreased"} by ${Math.abs(rain.percentChange).toFixed(1)}% versus the baseline, with a statistically significant trend.`
        : null,
      notable: rain?.percentChange !== null && Math.abs(rain.percentChange) >= 1
        ? `rainfall ${rain.percentChange > 0 ? "+" : ""}${rain.percentChange.toFixed(1)}%`
        : null
    },
    {
      id: "drySpell",
      priority: 2,
      significant: Boolean(drySpell?.trend?.significant),
      hasPracticalEffect: drySpell?.absoluteChange !== null && Math.abs(drySpell.absoluteChange) >= 2,
      statement: drySpell?.absoluteChange !== null
        ? `The longest rainy-season dry spell is about ${Math.abs(drySpell.absoluteChange).toFixed(0)} days ${drySpell.absoluteChange > 0 ? "longer" : "shorter"} versus the baseline, with a statistically significant trend.`
        : null,
      notable: drySpell?.absoluteChange !== null && Math.abs(drySpell.absoluteChange) >= 1
        ? `dry spell ${drySpell.absoluteChange > 0 ? "+" : ""}${Math.round(drySpell.absoluteChange)} days`
        : null
    },
    {
      id: "temperature",
      priority: 3,
      significant: Boolean(temperature?.trend?.significant),
      hasPracticalEffect: temperature?.absoluteChange !== null && Math.abs(temperature.absoluteChange) >= 0.3,
      statement: temperature?.absoluteChange !== null
        ? `Mean annual temperature is ${Math.abs(temperature.absoluteChange).toFixed(1)}°C ${temperature.absoluteChange > 0 ? "warmer" : "cooler"} versus the baseline, with a statistically significant trend.`
        : null,
      notable: temperature?.absoluteChange !== null && Math.abs(temperature.absoluteChange) >= 0.1
        ? `temperature ${temperature.absoluteChange > 0 ? "+" : ""}${temperature.absoluteChange.toFixed(1)}°C`
        : null
    }
  ];

  const qualified = candidates
    .filter(c => c.significant && c.hasPracticalEffect)
    .sort((a, b) => a.priority - b.priority);

  if (qualified.length > 0) {
    return qualified.map(c => c.statement).join(" ");
  }

  const notableList = candidates.map(c => c.notable).filter(Boolean);
  const notableText = notableList.length > 0 ? notableList.join(", ") : "no notable shifts";
  return `No significant shift detected in ${locationLabel}; notable changes: ${notableText}.`;
}

function analyzeClimateHistory(history, { latitude, onsetThresholdMm = 40 } = {}) {
  if (!history || !Array.isArray(history.daily) || history.daily.length === 0) {
    throw new Error("NASA data unavailable: historical daily series is empty.");
  }
  const lat = Number(latitude ?? history.coordinates?.lat);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("A valid field latitude is required.");
  const daily = history.daily
    .filter(row => typeof row.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.date))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!daily.length) throw new Error("NASA data unavailable: no valid dated observations.");

  const firstYear = Number(daily[0].date.slice(0, 4));
  const lastObservedYear = Number(daily[daily.length - 1].date.slice(0, 4));
  const lastObservedDate = new Date(`${daily[daily.length - 1].date}T00:00:00Z`);
  const lastCompleteYear = lastObservedDate.getUTCMonth() === 11 && lastObservedDate.getUTCDate() === 31
    ? lastObservedYear : lastObservedYear - 1;
  if (lastCompleteYear < firstYear) throw new Error("NASA data unavailable: no complete calendar year is present.");

  const rainySeason = detectRainySeason(daily, lat);
  if (!rainySeason.available) throw new Error("NASA data unavailable: precipitation coverage is insufficient to identify a rainy season.");
  const annualSeries = buildYearSeries(daily, firstYear, lastCompleteYear, rainySeason.months, lat, onsetThresholdMm);
  const seasons = [
    { id: "mainRainy", label: "Main rainy season", months: rainySeason.months },
    { id: "dry", label: "Opposing dry season", months: rainySeason.months.map(month => (month + 6) % 12) },
    { id: "transitionOne", label: "First transition", months: rainySeason.months.map(month => (month + 4) % 12) },
    { id: "transitionTwo", label: "Second transition", months: rainySeason.months.map(month => (month + 8) % 12) }
  ];
  const seasonalSeries = Object.fromEntries(seasons.map(season => [
    season.id,
    { ...season, series: buildYearSeries(daily, firstYear, lastCompleteYear, rainySeason.months, lat, onsetThresholdMm, season.months) }
  ]));
  const baselineStart = 1991;
  const baselineEnd = 2020;
  const recentYears = annualSeries.slice(-5).map(point => point.year);
  const metrics = Object.fromEntries(Object.keys(METRICS).map(metricId => [
    metricId,
    summarizeMetric(annualSeries, metricId, baselineStart, baselineEnd, recentYears)
  ]));

  return {
    status: "ok",
    source: history.source,
    community: history.community,
    coordinates: history.coordinates,
    retrievedAt: history.retrievedAt,
    cacheStatus: history.status,
    coverage: {
      startYear: firstYear,
      lastObservedDate: history.period?.end || daily[daily.length - 1].date,
      lastCompleteYear,
      completeYears: lastCompleteYear - firstYear + 1,
      missingPct: history.missingPct,
      unavailableParameters: history.unavailableParameters || []
    },
    method: {
      baseline: { startYear: baselineStart, endYear: baselineEnd },
      recentYears,
      minimumAnnualCoveragePct: MIN_COVERAGE * 100,
      onsetThresholdMm,
      onsetMethod: "First complete rolling 10-day rainfall total at or above the configured threshold within the detected four-month rainy season.",
      et0Method: "Daily Hargreaves-Samani reference ET₀ from T2M_MAX, T2M_MIN, day of year, and field latitude (extraterrestrial radiation in MJ/m²/day converted to mm/day equivalent via 0.408 factor).",
      trendMethod: "Theil-Sen slope per decade and two-sided Mann-Kendall test; p < 0.05 is significant.",
      projectionMethod: "Statistical trend projection (not a climate-model forecast). OLS extension with approximate 80% prediction interval for significant trends only.",
      missingDataMethod: "NASA fill values and missing observations remain null; no interpolation is performed. Annual metrics require at least 80% valid observations for their source parameter."
    },
    rainySeason,
    metricDefinitions: METRICS,
    annualSeries,
    seasonalSeries,
    metrics,
    headline: generateHeadline({ metrics }, history?.coordinates ? `${history.coordinates.lat.toFixed(2)}°N, ${history.coordinates.lng.toFixed(2)}°E` : null)
  };
}

module.exports = {
  METRICS,
  MIN_COVERAGE,
  mannKendall,
  theilSenSlope,
  projectTrend,
  detectRainySeason,
  hargreavesEt0,
  analyzeClimateHistory,
  generateHeadline
};
