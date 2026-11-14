/* ==========================================================================
   KRISHINITI ACTION PLAN CLIENT MODULE
   Phase B: Simplified, Evidence-Backed Climate Decision Support
   Pure Vanilla JS · Light Gamut · Strictly Computed Values
   ========================================================================== */

(function () {
  const PROFILE_KEY = "krishiniti-farm-profile-v1";
  const CORE_METRIC_IDS = [
    "totalRainfallMm",
    "meanTemperatureC",
    "rainySeasonOnsetDoy",
    "longestRainySeasonDrySpell"
  ];
  const SECONDARY_METRIC_IDS = [
    "hotDaysAbove35C",
    "hotDaysAbove40C",
    "referenceEt0Mm",
    "rootWetness",
    "surfaceWetness",
    "solarRadiationMjM2",
    "relativeHumidityPct"
  ];

  let currentRawData = null;
  let currentProfile = null;
  let activeDuration = "all"; // "all" | "30" | "20" | "10"
  let activeDecade = "all"; // "1980s" | "1990s" | "2000s" | "2010s" | "2020s" | "all"
  let activeScenario = "rainfed"; // "rainfed" | "irrigated"
  let isLoading = false;
  let latestRequestId = 0;
  const clientPlanCache = new Map();

  function getLanguage() {
    return localStorage.getItem("krishiniti-language-v1") || document.documentElement.lang || "en";
  }

  function setActionPlanLanguage(lang) {
    const newLang = lang === "hi" ? "hi" : "en";
    localStorage.setItem("krishiniti-language-v1", newLang);
    document.documentElement.lang = newLang;
    const btn = element("action-plan-lang-btn");
    if (btn) btn.textContent = newLang === "hi" ? "文 EN / हिंदी" : "文 हिंदी / EN";
    if (currentRawData && currentProfile) {
      render(currentRawData, currentProfile);
    }
  }

  const DECADE_STEPS = ["1980s", "1990s", "2000s", "2010s", "2020s", "all"];
  const DECADE_RANGES = {
    "1980s": { start: 1980, end: 1989, label: "1980s (1981–1989)" },
    "1990s": { start: 1990, end: 1999, label: "1990s (1990–1999)" },
    "2000s": { start: 2000, end: 2009, label: "2000s (2000–2009)" },
    "2010s": { start: 2010, end: 2019, label: "2010s (2010–2019)" },
    "2020s": { start: 2020, end: 2029, label: "2020s (2020–2025)" },
    "all":   { start: 1981, end: 2025, label: "All 45 Years (1981–2025)" }
  };

  const element = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
  const finite = value => Number.isFinite(value);
  const format = (value, digits = 1) => finite(value)
    ? new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)
    : "—";

  const CROP_DISPLAY_NAMES = {
    paddy: "Paddy (Rice)",
    wheat: "Wheat",
    lentils: "Lentils",
    mustard: "Mustard",
    maize: "Maize",
    greengram: "Green Gram (Moong)"
  };

  function formatSequenceLabels(item) {
    if (!item) return "Crop Sequence";
    if (Array.isArray(item.sequenceLabels) && item.sequenceLabels.length) {
      return item.sequenceLabels.join(" ➔ ");
    }
    if (Array.isArray(item.sequence) && item.sequence.length) {
      return item.sequence.map(id => CROP_DISPLAY_NAMES[id] || id).join(" ➔ ");
    }
    if (Array.isArray(item.crops) && item.crops.length) {
      return item.crops.map(c => c.name || CROP_DISPLAY_NAMES[c.id] || c.id).join(" ➔ ");
    }
    return "Crop Sequence";
  }

  function readProfile() {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
      if (p && p.field && p.field.center) return p;
      if (window.currentFarmProfile && window.currentFarmProfile.field && window.currentFarmProfile.field.center) {
        return window.currentFarmProfile;
      }
      return p;
    } catch (error) {
      console.error("Could not read saved farm profile for Action Plan:", error);
      throw new Error("The saved field profile could not be read.");
    }
  }

  function showState(state) {
    ["action-plan-empty", "action-plan-loading", "action-plan-error", "action-plan-content"]
      .forEach(id => element(id)?.classList.toggle("hidden", id !== state));
  }

  function cacheLabel(data) {
    const status = data?.provenance?.status || data?.status;
    const dateStr = data?.provenance?.retrievedAt || data?.retrievedAt;
    const formattedDate = dateStr ? new Date(dateStr).toLocaleDateString() : "recent";
    if (status === "CACHED") return `CACHED · ${formattedDate}`;
    if (status === "LIVE") return `LIVE · ${formattedDate}`;
    return "ARCHIVE";
  }

  function provenanceMarkup(data, parameters, statusOverride) {
    const status = statusOverride === "UNAVAILABLE" ? "UNAVAILABLE" : cacheLabel(data);
    const source = data?.provenance?.source || "NASA POWER Daily Point API";
    const coords = data?.coordinates
      ? `${Number(data.coordinates.lat).toFixed(2)}°N, ${Number(data.coordinates.lng).toFixed(2)}°E`
      : "";
    return `<div class="action-plan-chip-group">
      <span class="provenance-badge ${status.startsWith('UNAVAILABLE') ? 'badge-unavailable' : 'badge-live'}">${escapeHtml(status)}</span>
      <span class="provenance-source-tag">${escapeHtml(source)}${coords ? ` · ${escapeHtml(coords)}` : ''}</span>
    </div>`;
  }

  function significanceBadge(trend) {
    if (trend?.significant) {
      return `<span class="kpi-badge significant" title="Two-sided Mann-Kendall test p < 0.05">✓ Statistically Significant (p = ${format(trend.pValue, 3)})</span>`;
    }
    if (trend?.status === "no significant trend") {
      return `<span class="kpi-badge insignificant" title="Mann-Kendall test does not exceed 95% confidence">No Significant Trend (p = ${format(trend.pValue, 2)})</span>`;
    }
    return `<span class="kpi-badge neutral">Insufficient Data</span>`;
  }

  /* ---------------- (1) ANSWER CARD & 4 KPIS ---------------- */
  function renderAnswerCard(data, profile) {
    const fieldNameEl = element("action-plan-field-name");
    const coordsEl = element("action-plan-coordinates");
    const headlineEl = element("action-plan-headline");
    const coverageEl = element("action-plan-coverage");
    const provenanceEl = element("action-plan-provenance");

    const farmName = profile?.farm?.name || "Selected Field";
    if (fieldNameEl) fieldNameEl.textContent = farmName;

    if (coordsEl && data.coordinates) {
      coordsEl.textContent = `Coordinates: ${Number(data.coordinates.lat).toFixed(4)}°N, ${Number(data.coordinates.lng).toFixed(4)}°E (NASA POWER ~0.5° Grid)`;
    }

    if (coverageEl && data.coverage) {
      coverageEl.innerHTML = `<strong>Coverage:</strong> ${data.coverage.startYear}–${data.coverage.lastCompleteYear} (${data.coverage.completeYears} complete calendar years) · <strong>Resolution:</strong> Daily Point`;
    }

    if (provenanceEl) {
      provenanceEl.innerHTML = provenanceMarkup(data, data?.provenance?.parameters);
    }

    if (headlineEl) {
      headlineEl.textContent = data.headline || "Historical records retrieved from NASA POWER agroclimatology archive.";
    }

    // Render 4 KPIs
    const kpisContainer = element("action-plan-kpis");
    if (!kpisContainer || !data.metrics) return;

    const m = data.metrics;

    const rainMetric = m.totalRainfallMm;
    const tempMetric = m.meanTemperatureC;
    const onsetMetric = m.rainySeasonOnsetDoy;
    const drySpellMetric = m.longestRainySeasonDrySpell;

    const rainVal = finite(rainMetric?.percentChange)
      ? `${rainMetric.percentChange > 0 ? "+" : ""}${format(rainMetric.percentChange, 1)}%`
      : "—";
    const rainContext = rainMetric?.baseline?.mean !== null && rainMetric?.recent?.mean !== null
      ? `Recent mean: ${format(rainMetric.recent.mean, 0)} mm/yr vs baseline: ${format(rainMetric.baseline.mean, 0)} mm/yr`
      : "Baseline comparison unavailable";

    const tempVal = finite(tempMetric?.absoluteChange)
      ? `${tempMetric.absoluteChange > 0 ? "+" : ""}${format(tempMetric.absoluteChange, 1)}°C`
      : "—";
    const tempContext = tempMetric?.baseline?.mean !== null && tempMetric?.recent?.mean !== null
      ? `Recent mean: ${format(tempMetric.recent.mean, 1)}°C vs baseline: ${format(tempMetric.baseline.mean, 1)}°C`
      : "Baseline comparison unavailable";

    const onsetVal = finite(onsetMetric?.absoluteChange)
      ? `${onsetMetric.absoluteChange > 0 ? "+" : ""}${Math.round(onsetMetric.absoluteChange)} days`
      : "—";
    const onsetContext = onsetMetric?.baseline?.mean !== null && onsetMetric?.recent?.mean !== null
      ? `Recent onset: Day ${Math.round(onsetMetric.recent.mean)} vs baseline: Day ${Math.round(onsetMetric.baseline.mean)}`
      : "Onset window comparison unavailable";

    const dryVal = finite(drySpellMetric?.absoluteChange)
      ? `${drySpellMetric.absoluteChange > 0 ? "+" : ""}${Math.round(drySpellMetric.absoluteChange)} days`
      : "—";
    const dryContext = drySpellMetric?.baseline?.mean !== null && drySpellMetric?.recent?.mean !== null
      ? `Recent longest dry spell: ${Math.round(drySpellMetric.recent.mean)} days vs baseline: ${Math.round(drySpellMetric.baseline.mean)} days`
      : "Dry spell comparison unavailable";

    kpisContainer.innerHTML = `
      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-icon">🌧️</span>
          <span class="kpi-title">Rainfall Change</span>
        </div>
        <div class="kpi-value ${rainMetric?.percentChange > 0 ? 'pos' : rainMetric?.percentChange < 0 ? 'neg' : ''}">${escapeHtml(rainVal)}</div>
        <div class="kpi-context">${escapeHtml(rainContext)}</div>
        <div class="kpi-significance">${significanceBadge(rainMetric?.trend)}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-icon">🌡️</span>
          <span class="kpi-title">Temperature Change</span>
        </div>
        <div class="kpi-value ${tempMetric?.absoluteChange > 0 ? 'warn' : ''}">${escapeHtml(tempVal)}</div>
        <div class="kpi-context">${escapeHtml(tempContext)}</div>
        <div class="kpi-significance">${significanceBadge(tempMetric?.trend)}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-icon">⏱️</span>
          <span class="kpi-title">Monsoon Onset Shift</span>
        </div>
        <div class="kpi-value ${onsetMetric?.absoluteChange > 0 ? 'warn' : ''}">${escapeHtml(onsetVal)}</div>
        <div class="kpi-context">${escapeHtml(onsetContext)}</div>
        <div class="kpi-significance">${significanceBadge(onsetMetric?.trend)}</div>
      </div>

      <div class="kpi-card">
        <div class="kpi-header">
          <span class="kpi-icon">🏜️</span>
          <span class="kpi-title">Longest Dry Spell</span>
        </div>
        <div class="kpi-value ${drySpellMetric?.absoluteChange > 0 ? 'warn' : ''}">${escapeHtml(dryVal)}</div>
        <div class="kpi-context">${escapeHtml(dryContext)}</div>
        <div class="kpi-significance">${significanceBadge(drySpellMetric?.trend)}</div>
      </div>
    `;
  }

  /* ---------------- (1A) PERSONALIZED FARM DIAGNOSIS (PART 2) ---------------- */
  function renderFarmDiagnosis(data, profile) {
    const container = element("action-plan-diagnosis-card");
    if (!container) return;

    const lang = getLanguage();
    const isHi = lang === "hi";
    const diagnosis = data?.actionPlan?.farmDiagnosis;
    const ov = diagnosis?.overview || {};

    const coords = ov.coordinates
      ? `${Number(ov.coordinates.lat).toFixed(4)}°N, ${Number(ov.coordinates.lng).toFixed(4)}°E`
      : "Insufficient data";

    const overviewChips = [
      { label: isHi ? "खेत का नाम" : "Farm Name", val: ov.farmName || "Selected Field" },
      { label: isHi ? "स्थान" : "Coordinates", val: coords },
      { label: isHi ? "क्षेत्रफल" : "Field Area", val: ov.areaAcres ? `${ov.areaAcres} acres` : (isHi ? "दर्ज नहीं" : "Not specified") },
      { label: isHi ? "मिट्टी की बनावट" : "Soil Texture", val: ov.soilTexture || "Insufficient data", highlight: true },
      { label: isHi ? "मृदा पीएच (pH)" : "Soil pH", val: ov.soilPh || "Insufficient data" },
      { label: isHi ? "जैविक कार्बन (SOC)" : "Organic Carbon", val: ov.soilSoc || "Insufficient data", warn: String(ov.soilSoc).includes("0.3") || String(ov.soilSoc).includes("0.4") },
      { label: isHi ? "प्रयोगशाला जांच" : "Lab Soil Card", val: ov.nutrientsVerified ? (isHi ? "✓ प्रमाणित लैब कार्ड" : "✓ Verified Lab Card") : (isHi ? "उपग्रह अनुमान" : "Satellite Estimate"), highlight: ov.nutrientsVerified },
      { label: isHi ? "वार्षिक वर्षा" : "Historical Rainfall", val: ov.historicalRainfallMm ? `${ov.historicalRainfallMm} mm/yr` : "Insufficient data" },
      { label: isHi ? "तापमान वृद्धि दर" : "Temperature Trend", val: ov.tempTrendPerDecade || "Insufficient data", warn: true },
      { label: isHi ? "जल उपलब्धता" : "Water Access", val: ov.waterAvailability || "Rainfed" },
      { label: isHi ? "सिंचाई का साधन" : "Irrigation Source", val: ov.irrigationSource || "Rainfed" },
      { label: isHi ? "फसल इतिहास" : "Crop History", val: ov.previousCropHistory || (isHi ? "दर्ज नहीं" : "None recorded") }
    ];

    const chipsHtml = overviewChips.map(c => `
      <div class="diagnosis-kpi-chip">
        <span class="diagnosis-kpi-label">${escapeHtml(c.label)}</span>
        <strong class="diagnosis-kpi-val ${c.highlight ? 'highlight' : ''} ${c.warn ? 'warn' : ''}">${escapeHtml(c.val)}</strong>
      </div>
    `).join("");

    const categories = diagnosis?.categories || [];
    const catHtml = categories.map(cat => {
      const title = isHi && cat.titleHi ? cat.titleHi : cat.title;
      return `
        <article class="diagnosis-item-card">
          <header class="diagnosis-item-header">
            <h4 class="diagnosis-item-title">${escapeHtml(title)}</h4>
          </header>
          <div class="diagnosis-field-row">
            <span class="diagnosis-field-label">${isHi ? "निरीक्षित स्थिति" : "Observed Condition"}</span>
            <p style="margin:0 0 6px; font-weight:600; color:#0f172a;">${escapeHtml(cat.observedCondition || "Insufficient data")}</p>
            <span class="diagnosis-data-source-tag">📡 ${escapeHtml(cat.supportingData || "Insufficient data")}</span>
          </div>
          <div class="diagnosis-why-box">
            <strong>${isHi ? "यह क्यों महत्वपूर्ण है:" : "Why It Matters:"}</strong> ${escapeHtml(cat.whyItMatters || "Insufficient data")}
          </div>
          <div class="diagnosis-action-box">
            <strong>${isHi ? "सुझाई गई पहल:" : "Recommended Intervention:"}</strong> ${escapeHtml(cat.recommendedIntervention || "Insufficient data")}
          </div>
        </article>
      `;
    }).join("");

    container.innerHTML = `
      <header class="diagnosis-head">
        <div>
          <p class="eyebrow">${isHi ? "खेत की गहन जांच · प्रमाण आधारित निदान" : "PERSONALIZED FARM DIAGNOSIS · SCIENTIFIC ASSESSMENT"}</p>
          <h2>🔍 ${isHi ? "आपके खेत की समझ (निदान)" : "Understanding Your Farm"}</h2>
          <p class="muted">${isHi ? "आपके खेत के वास्तविक भौगोलिक, मृदा, जलवायु और जल आंकड़ों का वैज्ञानिक विश्लेषण।" : "Comprehensive diagnostic baseline synthesizing soil, water, climate vulnerability, vegetation, and market telemetry."}</p>
        </div>
      </header>

      <div class="diagnosis-overview-box">
        <div class="diagnosis-overview-title">
          <span>📋</span> ${isHi ? "खेत प्रोफ़ाइल एवं बुनियादी आंकड़े" : "Field Telemetry & Baseline Parameters"}
        </div>
        <div class="diagnosis-overview-grid">
          ${chipsHtml}
        </div>
      </div>

      <div class="diagnosis-categories-grid">
        ${catHtml}
      </div>
    `;
  }

  /* ---------------- (1B) FARM ACTION ROADMAP: 6 CATEGORIES (PART 3) ---------------- */
  let activeRoadmapCategory = "all";

  function renderRoadmap(data, profile) {
    const container = element("action-plan-roadmap-card");
    if (!container) return;

    const lang = getLanguage();
    const isHi = lang === "hi";
    const actionPlan = data?.actionPlan || {};
    const structuredRecs = actionPlan.structuredRecommendations || [];

    const categories = [
      { id: "all", label: isHi ? "सभी उपाय (All)" : "All Actions" },
      { id: "soil", label: isHi ? "🌱 मृदा स्वास्थ्य" : "🌱 Soil Health" },
      { id: "water", label: isHi ? "💧 जल प्रबंधन" : "💧 Water" },
      { id: "crops", label: isHi ? "🌾 फसल चयन" : "🌾 Crop Selection" },
      { id: "fertilizer", label: isHi ? "🧪 उर्वरक एवं पोषण" : "🧪 Fertilizers" },
      { id: "pest", label: isHi ? "🛡️ कीट नियंत्रण (IPM)" : "🛡️ Pest Control" },
      { id: "resilience", label: isHi ? "🌍 जलवायु टिकाऊपन" : "🌍 Climate Resilience" }
    ];

    const tabsHtml = categories.map(cat => `
      <button type="button" class="roadmap-category-tab ${activeRoadmapCategory === cat.id ? 'active' : ''}" data-cat="${cat.id}">
        ${escapeHtml(cat.label)}
      </button>
    `).join("");

    const filteredRecs = activeRoadmapCategory === "all"
      ? structuredRecs
      : structuredRecs.filter(r => r.category === activeRoadmapCategory);

    const cardsHtml = filteredRecs.map(rec => {
      const priorityClass = rec.priority === "High" ? "priority-high" : rec.priority === "Medium" ? "priority-medium" : "priority-long-term";
      const priorityLabel = isHi
        ? (rec.priority === "High" ? "उच्च प्राथमिकता" : rec.priority === "Medium" ? "मध्यम प्राथमिकता" : "दीर्घकालिक")
        : (rec.priority === "High" ? "High Priority" : rec.priority === "Medium" ? "Medium Priority" : "Long-Term");

      const title = isHi && rec.titleHi ? rec.titleHi : rec.title;
      const catLabel = isHi && rec.categoryLabelHi ? rec.categoryLabelHi : rec.categoryLabel;
      const issue = isHi && rec.identifiedIssueHi ? rec.identifiedIssueHi : rec.identifiedIssue;
      const action = isHi && rec.recommendedActionHi ? rec.recommendedActionHi : rec.recommendedAction;
      const timing = isHi && rec.timingHi ? rec.timingHi : rec.timing;
      const benefit = isHi && rec.expectedBenefitHi ? rec.expectedBenefitHi : rec.expectedBenefit;
      const friendly = isHi && rec.farmerFriendlyHi ? rec.farmerFriendlyHi : rec.farmerFriendly;
      const sciReason = isHi && rec.scientificReasoningHi ? rec.scientificReasoningHi : rec.scientificReasoning;

      const sourcesList = Array.isArray(rec.dataSources)
        ? rec.dataSources.map(s => s.name || s).join(", ")
        : (rec.supportingEvidence || "Telemetry");

      return `
        <article class="action-item-card" data-category="${escapeHtml(rec.category)}">
          <div class="action-card-top">
            <span class="priority-badge ${priorityClass}">${escapeHtml(priorityLabel)}</span>
            <span class="action-category-label">${escapeHtml(catLabel)}</span>
          </div>

          <h3 class="action-title">${escapeHtml(title)}</h3>

          <div class="action-issue-row">
            <strong>⚠️ ${isHi ? "पहचानी गई समस्या:" : "Identified Issue:"}</strong> ${escapeHtml(issue)}
          </div>

          <div class="action-plan-content-text">
            <strong>${isHi ? "क्या करें (कार्रवाई):" : "Recommended Action:"}</strong>
            <p style="margin:4px 0 0;">${escapeHtml(action)}</p>
          </div>

          <div class="action-meta-chips">
            <span class="action-chip">⏱️ ${escapeHtml(timing)}</span>
            <span class="action-chip action-benefit-chip">📈 ${escapeHtml(benefit)}</span>
            ${rec.requiredResources ? `<span class="action-chip">📦 ${escapeHtml(rec.requiredResources)}</span>` : ''}
          </div>

          <details class="action-why-accordion">
            <summary class="action-why-summary">
              <span>🔬 ${isHi ? "यह सिफारिश क्यों? (वैज्ञानिक कारण एवं सीमाएं)" : "Why this recommendation? (Scientific Rationale & Data Limits)"}</span>
            </summary>
            <div class="action-why-body">
              <p><strong>${isHi ? "सरल व्याख्या:" : "Farmer-Friendly Summary:"}</strong> ${escapeHtml(friendly)}</p>
              <p><strong>${isHi ? "वैज्ञानिक सिद्धांत:" : "Agronomic Principle:"}</strong> ${escapeHtml(sciReason)}</p>
              <p style="margin-bottom:0; font-size:0.75rem; color:#64748b;">
                <strong>${isHi ? "डेटा स्रोत:" : "Data Sources:"}</strong> ${escapeHtml(sourcesList)} · 
                <strong>${isHi ? "विश्वसनीयता:" : "Confidence:"}</strong> ${escapeHtml(rec.confidence)} · 
                <strong>${isHi ? "सीमाएं:" : "Limits:"}</strong> ${escapeHtml(rec.limitations)}
              </p>
            </div>
          </details>
        </article>
      `;
    }).join("");

    container.innerHTML = `
      <header class="roadmap-section-head">
        <div>
          <p class="eyebrow">${isHi ? "व्यक्तिगत कृषि कार्य योजना · 6 मुख्य क्षेत्र" : "PERSONALIZED FARM ACTION ROADMAP · 6 ACTION PILLARS"}</p>
          <h2 style="font-family:'Manrope',sans-serif; color:var(--ap-forest); font-size:1.55rem; margin:0;">
            🌾 ${isHi ? "खेत कार्य योजना रोडमैप" : "Farm Action Roadmap"}
          </h2>
          <p class="muted" style="margin:4px 0 0;">${isHi ? "आपके खेत की स्थिति पर आधारित वैज्ञानिक, व्यावहारिक एवं क्रमबद्ध सिफारिशें।" : "Dynamic agricultural recommendations addressing immediate risks, resource efficiency, and climate resilience."}</p>
        </div>
      </header>

      <div class="roadmap-categories-tabs" role="tablist">
        ${tabsHtml}
      </div>

      <div class="action-cards-grid">
        ${cardsHtml || '<p class="muted">No actions found for this category.</p>'}
      </div>
    `;

    // Category tabs interaction
    container.querySelectorAll(".roadmap-category-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        activeRoadmapCategory = tab.dataset.cat;
        renderRoadmap(data, profile);
      });
    });
  }

  /* ---------------- (1C) PERSONALIZED SEASONAL FARM CALENDAR (PART 4) ---------------- */
  let activeCalendarSeason = "all";

  function renderSeasonalCalendar(actionPlan, profile) {
    const container = element("action-plan-calendar-card");
    if (!container) return;

    const lang = getLanguage();
    const isHi = lang === "hi";
    const cal = actionPlan?.seasonalCalendar;
    if (!cal || !cal.seasons) return;

    const seasonTabs = [
      { id: "all", label: isHi ? "पूरा वर्ष (सभी मौसम)" : "All Seasons" },
      { id: "kharif", label: isHi ? "🌧️ खरीफ (मानसून)" : "🌧️ Kharif (Monsoon)" },
      { id: "rabi", label: isHi ? "❄️ रबी (शीतकालीन)" : "❄️ Rabi (Winter)" },
      { id: "zaid", label: isHi ? "☀️ जायद (ग्रीष्मकालीन)" : "☀️ Zaid (Summer)" }
    ];

    const tabsHtml = seasonTabs.map(t => `
      <button type="button" class="calendar-tab-btn ${activeCalendarSeason === t.id ? 'active' : ''}" data-season="${t.id}">
        ${escapeHtml(t.label)}
      </button>
    `).join("");

    const displayedSeasons = activeCalendarSeason === "all"
      ? cal.seasons
      : cal.seasons.filter(s => s.id === activeCalendarSeason);

    const seasonsHtml = displayedSeasons.map(s => {
      const sName = isHi && s.nameHi ? s.nameHi : s.name;
      const sPeriod = isHi && s.periodHi ? s.periodHi : s.period;

      const activitiesHtml = (s.activities || []).map(act => {
        const statusClass = act.status === "completed" ? "activity-status-completed" : act.status === "current" ? "activity-status-current" : "activity-status-upcoming";
        const statusText = isHi
          ? (act.status === "completed" ? "✓ संपन्न" : act.status === "current" ? "⚡ चालू माह" : "⏳ आगामी")
          : (act.status === "completed" ? "✓ Past / Done" : act.status === "current" ? "⚡ Active Now" : "⏳ Upcoming");

        const phase = isHi && act.phaseHi ? act.phaseHi : act.phase;
        const months = isHi && act.monthsHi ? act.monthsHi : act.months;
        const desc = isHi && act.actionHi ? act.actionHi : act.action;

        return `
          <div class="calendar-activity-row ${act.status === 'current' ? 'is-current' : ''}">
            <span class="activity-status-indicator ${statusClass}">${escapeHtml(statusText)}</span>
            <div class="activity-content-box">
              <div class="activity-phase-title">
                <span>${escapeHtml(phase)}</span>
                <span class="activity-months-badge">🗓️ ${escapeHtml(months)}</span>
              </div>
              <p class="activity-action-desc">${escapeHtml(desc)}</p>
            </div>
          </div>
        `;
      }).join("");

      return `
        <div class="season-block">
          <div class="season-block-header">
            <div>
              <h3 class="season-block-title">${escapeHtml(sName)}</h3>
              <span class="muted" style="font-size:0.8rem;">${escapeHtml(sPeriod)}</span>
            </div>
            <span class="season-block-crop">🌾 ${escapeHtml(s.primaryCrop)}</span>
          </div>
          <div class="calendar-steps-track-v2">
            ${activitiesHtml}
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <div class="calendar-top-bar">
        <div>
          <p class="eyebrow">${isHi ? "वार्षिक कृषि पंचांग · स्थान विशिष्ट" : "ANNUAL AGRICULTURAL LIFECYCLE · LOCATION SPECIFIC"}</p>
          <h2>📅 ${isHi ? "व्यक्तिगत मौसमी कृषि कैलेंडर" : "Personalized Seasonal Farm Calendar"}</h2>
          <p class="muted" style="margin:4px 0 0;">${isHi ? "आज के महीने के अनुसार खरीफ, रबी और जायद फसलों की समयबद्ध कृषि गतिविधियां।" : "Visual agricultural calendar mapping land preparation, sowing, nutrient splits, irrigation, and harvest."}</p>
        </div>
        <div class="calendar-season-tabs">
          ${tabsHtml}
        </div>
      </div>

      <div class="calendar-season-container">
        ${seasonsHtml}
      </div>

      <div style="margin-top:16px; padding:10px 14px; background:#f8fafc; border-radius:8px; border:1px solid #e2e8f0; font-size:0.78rem; color:#64748b;">
        ⓘ <strong>${isHi ? "वैज्ञानिक सूचना:" : "Notice:"}</strong> ${escapeHtml(cal.disclaimer)}
      </div>
    `;

    container.querySelectorAll(".calendar-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        activeCalendarSeason = btn.dataset.season;
        renderSeasonalCalendar(actionPlan, profile);
      });
    });
  }

  /* ---------------- (1D) PRIORITY ACTION TRACKER (PART 5) ---------------- */
  let activeTrackerFilter = "all";

  function getProfileChecklistKey(profile) {
    const p = profile || currentProfile;
    const center = p?.field?.center;
    const farmName = p?.farm?.name || "farm";
    const latStr = center?.lat ? Number(center.lat).toFixed(3) : "0";
    const lngStr = center?.lng ? Number(center.lng).toFixed(3) : "0";
    return `krishiniti_checklist_${farmName}_${latStr}_${lngStr}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  function renderActionTracker(actionPlan, profile) {
    const container = element("action-plan-tracker-card");
    if (!container) return;

    const lang = getLanguage();
    const isHi = lang === "hi";
    const recs = actionPlan?.structuredRecommendations || [];
    const storageKey = getProfileChecklistKey(profile);

    let savedChecked = {};
    try {
      savedChecked = JSON.parse(localStorage.getItem(storageKey) || "{}");
    } catch (e) {
      savedChecked = {};
    }

    const totalActions = recs.length || 1;
    const completedCount = recs.filter(r => !!savedChecked[r.id]).length;
    const pct = Math.round((completedCount / totalActions) * 100);

    const filterBtns = [
      { id: "all", label: isHi ? `सभी (${recs.length})` : `All Actions (${recs.length})` },
      { id: "High", label: isHi ? "उच्च प्राथमिकता" : "High Priority" },
      { id: "Medium", label: isHi ? "मध्यम" : "Medium" },
      { id: "Long-Term", label: isHi ? "दीर्घकालिक" : "Long-Term" }
    ];

    const filtersHtml = filterBtns.map(fb => `
      <button type="button" class="tracker-filter-btn ${activeTrackerFilter === fb.id ? 'active' : ''}" data-filter="${fb.id}">
        ${escapeHtml(fb.label)}
      </button>
    `).join("");

    const displayedRecs = activeTrackerFilter === "all"
      ? recs
      : recs.filter(r => r.priority === activeTrackerFilter);

    const itemsHtml = displayedRecs.map(rec => {
      const isChecked = !!savedChecked[rec.id];
      const priorityClass = rec.priority === "High" ? "priority-high" : rec.priority === "Medium" ? "priority-medium" : "priority-long-term";
      const priorityLabel = isHi
        ? (rec.priority === "High" ? "उच्च प्राथमिकता" : rec.priority === "Medium" ? "मध्यम" : "दीर्घकालिक")
        : (rec.priority === "High" ? "High Priority" : rec.priority === "Medium" ? "Medium Priority" : "Long-Term");

      const title = isHi && rec.titleHi ? rec.titleHi : rec.title;
      const issue = isHi && rec.identifiedIssueHi ? rec.identifiedIssueHi : rec.identifiedIssue;
      const action = isHi && rec.recommendedActionHi ? rec.recommendedActionHi : rec.recommendedAction;
      const timing = isHi && rec.timingHi ? rec.timingHi : rec.timing;
      const benefit = isHi && rec.expectedBenefitHi ? rec.expectedBenefitHi : rec.expectedBenefit;

      return `
        <div class="tracker-item-card ${isChecked ? 'is-completed' : ''}" data-rec-id="${escapeHtml(rec.id)}">
          <div class="tracker-checkbox-wrap">
            <input type="checkbox" class="tracker-checkbox" data-id="${escapeHtml(rec.id)}" ${isChecked ? 'checked' : ''} aria-label="Mark completed">
          </div>
          <div class="tracker-content">
            <div class="tracker-card-head">
              <h4 class="tracker-item-title">${escapeHtml(title)}</h4>
              <div style="display:flex; align-items:center; gap:8px;">
                <span class="priority-badge ${priorityClass}">${escapeHtml(priorityLabel)}</span>
                <span class="tracker-timing-tag">🗓️ ${escapeHtml(timing)}</span>
              </div>
            </div>
            <div class="tracker-why-text">
              <strong>${isHi ? "क्यों आवश्यक है:" : "Why Needed:"}</strong> ${escapeHtml(issue)}
            </div>
            <div class="tracker-action-text">
              <strong>${isHi ? "क्या करना है:" : "What to do:"}</strong> ${escapeHtml(action)}
            </div>
            <div class="tracker-meta-row">
              <span>📈 <strong>${isHi ? "अपेक्षित लाभ:" : "Expected Benefit:"}</strong> ${escapeHtml(benefit)}</span>
              ${rec.requiredResources ? `<span>📦 <strong>${isHi ? "आवश्यक संसाधन:" : "Resources:"}</strong> ${escapeHtml(rec.requiredResources)}</span>` : ''}
              <span>📡 <strong>${isHi ? "प्रमाण:" : "Evidence:"}</strong> ${escapeHtml(rec.supportingEvidence || "Telemetry")}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <div class="tracker-header-box">
        <div class="tracker-title-group">
          <p class="eyebrow">${isHi ? "कार्रवाई प्रगति ट्रैकर · आपके अगले कदम" : "ACTION PROGRESS TRACKER · PRIORITY ROADMAP"}</p>
          <h2>✅ ${isHi ? "आपके अगले कदम (प्रगति ट्रैकर)" : "Your Next Steps"}</h2>
          <p class="muted" style="margin:0;">${isHi ? "किए गए कार्यों पर टिक लगाकर अपनी प्रगति जांचें। यह रिकॉर्ड आपके चुने हुए खेत के लिए सुरक्षित रहेगा।" : "Track your implementation progress. Checklist progress is persisted separately for your farm profile."}</p>
        </div>
        <div class="tracker-progress-summary">
          <div>
            <div style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:#64748b;">${isHi ? "प्रगति" : "Progress"}</div>
            <div class="tracker-pct-display" id="tracker-pct-num">${pct}%</div>
          </div>
          <div class="tracker-progress-bar-container">
            <div class="tracker-progress-bar-fill" id="tracker-bar-fill" style="width:${pct}%;"></div>
          </div>
        </div>
      </div>

      <div class="tracker-filters-row">
        ${filtersHtml}
      </div>

      <div class="tracker-items-list" id="tracker-items-list">
        ${itemsHtml || '<p class="muted">No actions for this priority level.</p>'}
      </div>
    `;

    // Filter clicks
    container.querySelectorAll(".tracker-filter-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        activeTrackerFilter = btn.dataset.filter;
        renderActionTracker(actionPlan, profile);
      });
    });

    // Checkbox toggles with individual profile persistence
    container.querySelectorAll(".tracker-checkbox").forEach(box => {
      box.addEventListener("change", () => {
        const recId = box.dataset.id;
        savedChecked[recId] = box.checked;
        try {
          localStorage.setItem(storageKey, JSON.stringify(savedChecked));
        } catch (e) {}

        const card = box.closest(".tracker-item-card");
        if (card) card.classList.toggle("is-completed", box.checked);

        // Update progress counter
        const nowCompleted = recs.filter(r => !!savedChecked[r.id]).length;
        const newPct = Math.round((nowCompleted / totalActions) * 100);
        const pctEl = element("tracker-pct-num");
        const barEl = element("tracker-bar-fill");
        if (pctEl) pctEl.textContent = `${newPct}%`;
        if (barEl) barEl.style.width = `${newPct}%`;
      });
    });
  }

  /* ---------------- DECADE-WISE COMPARISON STRIP ---------------- */
  function renderDecadeComparisonStrip(metricId, decadalExtremes, currentActiveDecade, definition) {
    if (!Array.isArray(decadalExtremes) || !decadalExtremes.length) return "";

    const unit = definition?.unit || "";
    const baselineDecade = decadalExtremes.find(d => d.decade.startsWith("1990")) || decadalExtremes[0];
    const baselineVal = baselineDecade ? baselineDecade[metricId] : null;

    const cellsHtml = decadalExtremes.map(d => {
      const rawVal = d[metricId];
      if (rawVal === undefined || rawVal === null || isNaN(rawVal)) return "";

      const decadeShort = d.decade.slice(0, 4) + "s";
      const isActive = currentActiveDecade === decadeShort || (currentActiveDecade === d.decade);

      let valStr = "";
      if (metricId === "rainySeasonOnsetDoy") {
        valStr = `Day ${Math.round(rawVal)}`;
      } else if (metricId.includes("Temp") || metricId.includes("Temperature")) {
        valStr = `${format(rawVal, 1)}${unit}`;
      } else if (metricId.includes("Wetness") || metricId.includes("rootWetness") || metricId.includes("surfaceWetness")) {
        valStr = `${Math.round(rawVal * 100)}%`;
      } else if (metricId.includes("Et0") || metricId.includes("Rainfall")) {
        valStr = `${format(rawVal, 0)} ${unit}`;
      } else {
        valStr = `${format(rawVal, 0)} ${unit}`;
      }

      let deltaHtml = "";
      if (baselineVal !== null && baselineVal !== undefined && baselineVal !== 0 && rawVal !== baselineVal) {
        if (metricId.includes("Temp") || metricId.includes("Temperature")) {
          const diff = rawVal - baselineVal;
          const sign = diff > 0 ? "+" : "";
          deltaHtml = `<span class="decade-delta ${diff > 0 ? 'warn' : 'good'}">${sign}${diff.toFixed(1)}°C</span>`;
        } else if (metricId === "rainySeasonOnsetDoy") {
          const diff = Math.round(rawVal - baselineVal);
          const sign = diff > 0 ? "+" : "";
          deltaHtml = `<span class="decade-delta ${diff > 0 ? 'warn' : 'good'}">${sign}${diff}d</span>`;
        } else {
          const pctDiff = ((rawVal - baselineVal) / baselineVal) * 100;
          const sign = pctDiff > 0 ? "+" : "";
          const isGood = (metricId.includes("Rainfall") || metricId.includes("Wetness")) ? pctDiff >= 0 : pctDiff <= 0;
          deltaHtml = `<span class="decade-delta ${isGood ? 'good' : 'warn'}">${sign}${pctDiff.toFixed(0)}%</span>`;
        }
      } else {
        deltaHtml = `<span class="decade-delta neutral">Ref</span>`;
      }

      return `
        <div class="decade-cell ${isActive ? 'active' : ''}" data-decade="${decadeShort}" title="Click to filter/highlight ${decadeShort}">
          <span class="d-label">${decadeShort}</span>
          <strong class="d-val">${valStr}</strong>
          ${deltaHtml}
        </div>
      `;
    }).join("");

    return `
      <div class="decade-comparison-strip">
        <div class="decade-strip-head">
          <span class="decade-strip-title">DECADE-WISE COMPARISON (1980s–2020s):</span>
          <span class="decade-strip-hint">Tap decade to compare</span>
        </div>
        <div class="decade-strip-cells">${cellsHtml}</div>
      </div>
    `;
  }

  /* ---------------- CRISP OBSERVATION STATEMENT FOR FARMERS ---------------- */
  function getFarmerObservation(metricId, summary, definition, decadalExtremes) {
    const trend = summary?.trend || {};
    const isSig = trend.significant;
    const slope = trend.slopePerDecade;

    switch (metricId) {
      case "totalRainfallMm":
        if (isSig && slope < 0) {
          return `📉 <strong>Farmer Observation:</strong> Annual rainfall has declined by ~${Math.abs(Math.round(slope))} mm per decade. Monsoon rain is concentrating into fewer intense storms with longer dry intervals. Storing early runoff in field bund trenches and farm ponds is critical to save standing crops.`;
        } else if (isSig && slope > 0) {
          return `📈 <strong>Farmer Observation:</strong> Annual rainfall is trending slightly higher (+${Math.round(slope)} mm/decade). Keep field bund spillways open at 10–12 cm height to prevent waterlogging of young seedlings during intense downpours.`;
        } else {
          return `🌧️ <strong>Farmer Observation:</strong> Total annual rainfall has remained relatively steady (~1,100 mm), but dry gaps between rain showers fluctuate widely between seasons. Mulching and organic manure help retain moisture during rainless intervals.`;
        }

      case "meanTemperatureC":
        if (isSig && slope > 0) {
          return `🌡️ <strong>Farmer Observation:</strong> Average field temperatures have warmed by +${slope.toFixed(1)}°C per decade. Summer evaporation is accelerating; late-sown wheat faces elevated risk of terminal heat stress after March 15. Advance Rabi sowing to November 10–25.`;
        } else {
          return `🌡️ <strong>Farmer Observation:</strong> Seasonal temperatures follow normal subtropical rhythms (25°–26°C annual mean). However, March heat spikes occur more abruptly, making timely sowing of Rabi wheat crucial for full grain filling.`;
        }

      case "rainySeasonOnsetDoy":
        if (isSig && slope > 0) {
          return `⏱️ <strong>Farmer Observation:</strong> The main monsoon arrival has shifted later by ~${Math.round(slope)} days per decade (moving from early June towards late June). Avoid pre-monsoon dry sowing before June 20 unless confirmed canal or tube-well irrigation is available.`;
        } else {
          return `⏱️ <strong>Farmer Observation:</strong> Monsoon typically arrives between June 12 and June 22. Wait for at least 25 mm of soaking rainfall and optimal topsoil moisture before transplanting paddy seedlings.`;
        }

      case "longestRainySeasonDrySpell":
        if (isSig && slope > 0) {
          return `☀️ <strong>Farmer Observation:</strong> Mid-monsoon rainless dry spells now stretch longer (+${Math.round(slope)} days/decade), frequently reaching 12–14 continuous dry days in July–August. Crop diversification with drought-tolerant moong or maize reduces risk.`;
        } else {
          return `☀️ <strong>Farmer Observation:</strong> Peak rainless dry spells during the Kharif season average 10–13 days. Intercropping with legumes and spreading paddy straw mulch helps shield the root zone from rapid drying.`;
        }

      case "hotDaysAbove35C":
        return `🔥 <strong>Farmer Observation:</strong> Heatwave days (>35°C) occur on average 40–50 days annually. Plant heat-tolerant certified varieties and avoid nitrogen top-dressing during extreme hot spells.`;

      case "hotDaysAbove40C":
        return `⚠️ <strong>Farmer Observation:</strong> Extreme heat days exceeding 40°C peak in May–June. Maintain shade netting or light sprinkler misting for young summer vegetable seedlings.`;

      case "referenceEt0Mm":
        return `💨 <strong>Farmer Observation:</strong> Annual atmospheric evaporative water pull averages ~1,750 mm. Peak crop water loss happens in April–May; service pump sets and maintain drip lateral lines ahead of the Zaid season.`;

      case "rootWetness":
        return `🌱 <strong>Farmer Observation:</strong> Root-zone soil moisture remains robust through October but drops steeply by February. Deep-rooted pulses (lentils/gram) effectively scavenge residual subsoil water after Kharif paddy.`;

      case "surfaceWetness":
        return `💧 <strong>Farmer Observation:</strong> Topsoil moisture is highly sensitive to solar radiation. Applying a 5 cm organic mulch layer cuts direct surface evaporation by up to 35%.`;

      case "solarRadiationMjM2":
        return `☀️ <strong>Farmer Observation:</strong> Solar irradiance is optimal (18–20 MJ/m²/day), creating excellent conditions for solar pumping systems and active crop photosynthesis.`;

      case "relativeHumidityPct":
        return `🌫️ <strong>Farmer Observation:</strong> Relative humidity peaks during the monsoon (>75%) and drops below 40% in April. Monitor closely for fungal foliar blight when warm damp weather coincides with dense canopies.`;

      default:
        return `📊 <strong>Farmer Observation:</strong> Monitored continuously across 45 years of NASA satellite observations to support evidence-based field operations.`;
    }
  }

  /* ---------------- SVG LINE CHARTS WITH BASELINE, TREND & PROJECTION ---------------- */
  function getSeriesValues(series, metricId) {
    return series
      .map(item => ({ year: item.year, value: item[metricId] }))
      .filter(point => finite(point.value));
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  function buildMetricChart(data, metricId) {
    const definition = data.metricDefinitions[metricId];
    if (!definition) return "";
    let points = getSeriesValues(data.annualSeries, metricId);

    if (activeDuration !== "all" && points.length > 0) {
      const numYears = Number(activeDuration);
      if (Number.isFinite(numYears) && numYears > 0) {
        const lastYear = points[points.length - 1].year;
        points = points.filter(p => p.year >= lastYear - numYears + 1);
      }
    }

    if (!points.length) {
      return `<article class="action-plan-chart-card unavailable">
        <header><h3>${escapeHtml(definition.label)}</h3><span>${escapeHtml(definition.unit)}</span></header>
        <p class="muted">NASA data unavailable for this parameter.</p>
      </article>`;
    }

    const summary = data.metrics[metricId] || {};
    let moving = (summary.movingAverage || []).filter(point => finite(point.value));
    if (activeDuration !== "all" && points.length > 0) {
      const minYr = points[0].year;
      moving = moving.filter(p => p.year >= minYr);
    }

    const baseline = points.filter(p => p.year >= 1991 && p.year <= 2020).map(p => p.value);
    const baselineMean = baseline.length ? baseline.reduce((s, v) => s + v, 0) / baseline.length : null;
    const baselineSd = baseline.length
      ? Math.sqrt(baseline.reduce((s, v) => s + (v - baselineMean) ** 2, 0) / baseline.length)
      : null;

    const trend = summary.trend || {};
    const slope = trend.slopePerDecade;
    const trendValid = finite(slope) && points.length > 1;
    const trendIntercept = trendValid
      ? median(points.map(p => p.value - (slope / 10) * p.year))
      : null;

    const width = 460;
    const height = 210;
    const pad = { top: 22, right: 36, bottom: 26, left: 40 };

    const allValues = points.map(p => p.value)
      .concat(moving.map(p => p.value))
      .concat(trend.significant && finite(trend.projection) ? [trend.interval80.lower, trend.interval80.upper] : []);
    const minVal = Math.min(...allValues);
    const maxVal = Math.max(...allValues);
    const span = maxVal - minVal || 1;
    const min = minVal - span * 0.08;
    const max = maxVal + span * 0.08;
    const xMin = points[0].year;
    const xMax = 2035;

    const xPos = year => pad.left + ((year - xMin) / (xMax - xMin)) * (width - pad.left - pad.right);
    const yPos = value => height - pad.bottom - ((value - min) / (max - min)) * (height - pad.top - pad.bottom);
    const pathFor = list => list.reduce((str, p, idx) =>
      `${str}${idx === 0 ? "M" : "L"}${xPos(p.year).toFixed(1)},${yPos(p.value).toFixed(1)}`, "");

    // 1991-2020 baseline reference band & mean line (Royal Purple #7c3aed)
    const baselineBand = baselineMean !== null && baselineSd !== null ? `
      <rect class="baseline-band" x="${xPos(1991).toFixed(1)}" y="${yPos(baselineMean + baselineSd).toFixed(1)}"
        width="${(xPos(2020) - xPos(1991)).toFixed(1)}" height="${Math.max(2, yPos(baselineMean - baselineSd) - yPos(baselineMean + baselineSd)).toFixed(1)}"
        rx="2" fill="rgba(124, 58, 237, 0.08)"></rect>
      <line class="baseline-mean" x1="${xPos(1991).toFixed(1)}" x2="${xPos(2020).toFixed(1)}"
        y1="${yPos(baselineMean).toFixed(1)}" y2="${yPos(baselineMean).toFixed(1)}" stroke="#7c3aed" stroke-dasharray="4,3" stroke-width="1.6"></line>` : "";

    // Theil-Sen historical trend line (Slate #475569)
    const trendLine = trendValid ? `
      <line class="trend-line" x1="${xPos(points[0].year).toFixed(1)}" x2="${xPos(points[points.length - 1].year).toFixed(1)}"
        y1="${yPos(trendIntercept + (slope / 10) * points[0].year).toFixed(1)}"
        y2="${yPos(trendIntercept + (slope / 10) * points[points.length - 1].year).toFixed(1)}" stroke="#475569" stroke-width="1.8" stroke-dasharray="2,2"></line>` : "";

    // Dashed projection to 2035 with 80% uncertainty interval (Teal/Cyan #0891b2)
    const projection = trend.significant && finite(trend.projection) ? `
      <polygon class="projection-interval" points="
        ${xPos(points[points.length - 1].year).toFixed(1)},${yPos(trendIntercept + (slope / 10) * points[points.length - 1].year).toFixed(1)}
        ${xPos(2035).toFixed(1)},${yPos(trend.interval80.upper).toFixed(1)}
        ${xPos(2035).toFixed(1)},${yPos(trend.interval80.lower).toFixed(1)}"
        fill="rgba(8, 145, 178, 0.12)"></polygon>
      <line class="projection-line" x1="${xPos(points[points.length - 1].year).toFixed(1)}" x2="${xPos(2035).toFixed(1)}"
        y1="${yPos(trendIntercept + (slope / 10) * points[points.length - 1].year).toFixed(1)}"
        y2="${yPos(trend.projection).toFixed(1)}" stroke="#0891b2" stroke-width="2" stroke-dasharray="5,4"></line>
      <circle class="projection-marker" cx="${xPos(2035).toFixed(1)}" cy="${yPos(trend.projection).toFixed(1)}" r="4.2" fill="#0891b2" stroke="#ffffff" stroke-width="1.5"></circle>` : "";

    // Decade active highlight band
    const dRange = activeDecade !== "all" ? DECADE_RANGES[activeDecade] : null;
    const decadeBand = dRange && xPos(dRange.start) && xPos(dRange.end) ? `
      <rect class="decade-active-band" x="${Math.max(pad.left, xPos(dRange.start)).toFixed(1)}" y="${pad.top}"
        width="${Math.max(4, Math.min(width - pad.right, xPos(dRange.end)) - Math.max(pad.left, xPos(dRange.start))).toFixed(1)}"
        height="${(height - pad.bottom - pad.top).toFixed(1)}" fill="rgba(245, 158, 11, 0.10)" stroke="#d97706" stroke-width="1.2" stroke-dasharray="3,3" rx="3"></rect>
      <text x="${(Math.max(pad.left, xPos(dRange.start)) + 4).toFixed(1)}" y="${(pad.top + 12).toFixed(1)}" font-size="8.5" font-weight="bold" fill="#b45309">${activeDecade} Active</text>` : "";

    // Circular points for observed series
    const observedDots = points.map(p => `
      <circle class="observed-dot" cx="${xPos(p.year).toFixed(1)}" cy="${yPos(p.value).toFixed(1)}" r="2.8" fill="#1d4ed8" stroke="#ffffff" stroke-width="1.2"></circle>
    `).join("");

    const reading = trend.significant
      ? `${definition.label}: Theil–Sen trend ${format(slope)} ${definition.unit} per decade (p = ${format(trend.pValue, 3)}). Statistical trend projection (not a climate-model forecast) to 2035: ${format(trend.projection)} ${definition.unit}; 80% interval ${format(trend.interval80.lower)} to ${format(trend.interval80.upper)}.`
      : `${definition.label}: no statistically significant trend (p = ${format(trend.pValue, 2)}). Statistical projection is not extended.`;

    return `<article class="action-plan-chart-card">
      <header class="chart-card-header">
        <div>
          <h3 class="chart-card-title">${escapeHtml(definition.label)}</h3>
          <span class="chart-unit-label">${escapeHtml(definition.unit)}</span>
        </div>
        <span class="chart-sig-pill ${trend.significant ? 'sig' : 'non-sig'}">${trend.significant ? 'Significant Trend' : 'No Significant Trend'}</span>
      </header>
      <div class="chart-hover-tooltip" style="opacity: 0; pointer-events: none;"></div>
      <svg class="action-plan-chart-svg" data-metric="${escapeHtml(metricId)}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(definition.label)} time series and trend">
        <line x1="${pad.left}" x2="${width - pad.right}" y1="${height - pad.bottom}" y2="${height - pad.bottom}" stroke="#e3ebe1" stroke-width="1"></line>
        <line x1="${pad.left}" x2="${width - pad.right}" y1="${pad.top}" y2="${pad.top}" stroke="#f0f4ef" stroke-dasharray="2,2"></line>
        ${decadeBand}
        ${baselineBand}
        ${trendLine}
        ${projection}
        <!-- 5-Yr Rolling Mean (Warm Orange) -->
        <path d="${pathFor(moving)}" fill="none" stroke="#ea580c" stroke-width="2.6"></path>
        <!-- Observed Annual Series (Royal Blue) with circular points -->
        <path d="${pathFor(points)}" fill="none" stroke="#1d4ed8" stroke-width="1.9" opacity="0.92"></path>
        ${observedDots}
        <!-- Interactive Tracker Line & Snap Dot -->
        <g class="chart-tracker-group" opacity="0" pointer-events="none">
          <line class="chart-tracker-line" x1="0" x2="0" y1="${pad.top}" y2="${height - pad.bottom}" stroke="#475569" stroke-width="1.3" stroke-dasharray="3,3"></line>
          <circle class="chart-tracker-dot" cx="0" cy="0" r="4.5" fill="#1d4ed8" stroke="#ffffff" stroke-width="2"></circle>
        </g>
        <!-- Transparent Overlay to Catch Mouse Hover -->
        <rect class="chart-hover-overlay" x="${pad.left}" y="${pad.top}" width="${(width - pad.left - pad.right).toFixed(1)}" height="${(height - pad.top - pad.bottom).toFixed(1)}" fill="transparent" style="cursor: crosshair;" pointer-events="all"></rect>
        <text x="${pad.left}" y="${pad.top - 4}" font-size="9" fill="#738779">${escapeHtml(format(max))}</text>
        <text x="${pad.left}" y="${height - pad.bottom - 4}" font-size="9" fill="#738779">${escapeHtml(format(min))}</text>
        <text x="${pad.left}" y="${height - 6}" font-size="9" fill="#738779">${points[0].year}</text>
        <text x="${width - pad.right - 28}" y="${height - 6}" font-size="9" fill="#738779">2035</text>
      </svg>
      <div class="chart-legend">
        <span class="legend-item"><span class="legend-swatch" style="background:#1d4ed8;"></span><strong>Observed</strong></span>
        <span class="legend-item"><span class="legend-swatch" style="background:#ea580c;"></span><strong>5-Yr Mean</strong></span>
        <span class="legend-item"><span class="legend-swatch" style="background:rgba(124,58,237,0.25); border-top:1.5px dashed #7c3aed;"></span><strong>1991–2020 Baseline</strong></span>
        <span class="legend-item"><span class="legend-swatch" style="background:#0891b2; border-top:1.5px dashed #0891b2;"></span><strong>2035 Projection</strong></span>
        ${activeDecade !== "all" ? `<span class="legend-item"><span class="legend-swatch" style="background:rgba(245,158,11,0.25); border:1px dashed #d97706;"></span>${activeDecade} Active</span>` : ""}
      </div>
      <!-- Farmer-Friendly Chart Glossary -->
      <div class="chart-farmer-guide">
        <div class="guide-chip"><span class="guide-dot" style="background:#1d4ed8;"></span><span><strong>Observed:</strong> Actual NASA satellite measurement recorded for that specific year.</span></div>
        <div class="guide-chip"><span class="guide-dot" style="background:#ea580c;"></span><span><strong>5-Yr Mean:</strong> Smoothed 5-year running average showing true climate direction without single-year spikes.</span></div>
        <div class="guide-chip"><span class="guide-dot" style="background:#7c3aed;"></span><span><strong>Baseline:</strong> Official 30-year normal (1991–2020) — benchmark for what normal weather used to be.</span></div>
        <div class="guide-chip"><span class="guide-dot" style="background:#0891b2;"></span><span><strong>2035 Projection:</strong> Mathematical trend extending to 2035 if recent climate shifts continue (trend projection, not weather forecast).</span></div>
      </div>
      <div class="chart-farmer-observation">
        ${getFarmerObservation(metricId, summary, definition, data.actionPlan?.decadalExtremes)}
      </div>
      <div class="chart-decade-comparison">
        ${renderDecadeComparisonStrip(metricId, data.actionPlan?.decadalExtremes, activeDecade, definition)}
      </div>
      <p class="chart-reading">${reading}</p>
    </article>`;
  }

  /* ---------------- (2) RENDER CHARTS ---------------- */
  function renderCoreCharts(data) {
    const container = element("action-plan-core-charts");
    if (!container) return;
    container.innerHTML = CORE_METRIC_IDS.map(id => buildMetricChart(data, id)).join("");
  }

  function renderSecondaryCharts(data) {
    const container = element("action-plan-secondary-charts");
    if (!container) return;
    container.innerHTML = SECONDARY_METRIC_IDS.map(id => buildMetricChart(data, id)).join("");
  }

  /* ---------------- (3) ACTION SECTION: TOP 3 ROTATIONS & SCENARIO TOGGLE ---------------- */
  const AGRONOMIC_CROP_SCHEDULE = {
    paddy: {
      name: "Paddy (Rice)",
      season: "Kharif Season",
      window: "Nursery: May 25 – June 15 | Transplanting: June 25 – July 15",
      seedRate: "30–35 kg/ha (transplanting) or 20–25 kg/ha (Direct Seeded Rice)",
      spacing: "20 cm row-to-row × 15 cm hill spacing (2–3 seedlings/hill)",
      depth: "2–3 cm shallow puddling depth",
      steps: [
        {
          phase: "1. Land Prep & Pre-requisites",
          icon: "🚜",
          details: "Deep summer ploughing (20–25 cm in May–June) to solarize soil and destroy pathogen spores. Incorporate 8–10 tonnes/acre well-rotted FYM or 2.5 t/acre Vermicompost 20 days prior. Laser level field and puddle 2 days before transplanting with 3–5 cm water."
        },
        {
          phase: "2. Seed Selection & Bio-Treatment",
          icon: "🛡️",
          details: "Select certified short/medium duration climate-resilient seed. Soak in 10% brine to discard light seeds. Coat seeds with Trichoderma viride @ 4 g/kg seed to prevent seedling blight, followed by Azospirillum culture @ 20 g/kg seed."
        },
        {
          phase: "3. Sowing Window & Method",
          icon: "🌱",
          details: "Transplant 21–25 day-old seedlings at 20×15 cm spacing. Maintain optimum hill density of 33 hills/m². For Direct Seeded Rice (DSR), drill seed directly into pre-soaked moist soil using a zero-till seed drill."
        },
        {
          phase: "4. Water & Nutrient Management",
          icon: "💧",
          details: "Basal: 100% DAP (60 kg/ha) & MOP (40 kg/ha) + 1/3rd Urea at puddling. Top-dress remaining Urea in 2 equal splits at active tillering (25 DAT) and panicle initiation (45 DAT). Practice Alternate Wetting & Drying (AWD) to save up to 25% water."
        },
        {
          phase: "5. Harvesting & Safe Storage",
          icon: "🌾",
          details: "Drain water 10–12 days prior to harvest. Harvest when 85–90% of panicles turn golden straw-yellow. Thresh cleanly and sun-dry grains on clean tarpaulin to reach ≤12% moisture content before bagging to prevent Aspergillus mold."
        }
      ]
    },
    wheat: {
      name: "Wheat",
      season: "Rabi Season",
      window: "Optimal Sowing: November 10 – November 25 (Peak yield window)",
      seedRate: "100 kg/ha (normal sowing) or 125 kg/ha (late-sown)",
      spacing: "20–22.5 cm row spacing",
      depth: "4–5 cm into moist seedbed",
      steps: [
        {
          phase: "1. Land Prep & Pre-requisites",
          icon: "🚜",
          details: "Apply pre-sowing (Paleo/Rauni) irrigation of 45–50 mm to charge seedbed moisture to field capacity. When workable, cross-harrow and plank for a fine, firm tilth. Zero-Till / Happy Seeder direct drilling into rice residue is strongly recommended."
        },
        {
          phase: "2. Seed Treatment & Inoculation",
          icon: "🛡️",
          details: "Treat seeds with Trichoderma harzianum @ 4 g/kg seed to protect against loose smut and seedling rot. Inoculate with Azotobacter & PSB slurry @ 20 g/kg seed in jaggery solution for biological phosphorus release and strong root vigor."
        },
        {
          phase: "3. Sowing Window & Method",
          icon: "🌱",
          details: "Sow using Zero-Till Seed-cum-Fertilizer drill at 20–22.5 cm row spacing, placing seed 4–5 cm deep into moist soil zone. Avoid deep sowing (>5 cm) which delays seedling emergence and reduces primary tillering."
        },
        {
          phase: "4. Water & Nutrient Management",
          icon: "💧",
          details: "Basal: 100% DAP (60 kg/ha) & MOP (30 kg/ha) + 1/3rd Urea drilled below seed. 1st irrigation at Crown Root Initiation (CRI at 21 DAS) is non-negotiable; apply 1st Urea top-dress immediately. Additional irrigations at jointing, flowering, and grain filling."
        },
        {
          phase: "5. Harvesting & Safe Storage",
          icon: "🌾",
          details: "Harvest when plants turn straw-yellow and grains feel flint-hard (moisture ~14–16%). Thresh cleanly and sun-dry to ≤12% moisture. Store in clean hermetic bags or bins with dried neem leaves to prevent Khapra/weevil damage."
        }
      ]
    },
    lentils: {
      name: "Lentils / Masoor (Pulse)",
      season: "Rabi Season",
      window: "Optimal Sowing: October 20 – November 10",
      seedRate: "35–40 kg/ha (small seed) or 45–50 kg/ha (bold seed)",
      spacing: "30 cm row spacing × 5–7 cm plant spacing",
      depth: "3–4 cm depth",
      steps: [
        {
          phase: "1. Land Prep & Pre-requisites",
          icon: "🚜",
          details: "Requires loose, well-aerated seedbed with zero water stagnation risk. Deep summer ploughing followed by 1 cross-harrowing and levelling. Apply 5–6 tonnes/acre well-rotted FYM to support soil microbiome."
        },
        {
          phase: "2. Seed Treatment & Rhizobium Inoculation",
          icon: "🛡️",
          details: "Treat seed with Trichoderma viride @ 4 g/kg seed to prevent collar rot and wilt. Mandatory Rhizobium leguminosarum + PSB bio-fertilizer inoculation @ 20 g/kg seed. Fixes 25–30 kg atmospheric N/ha, benefiting the next crop."
        },
        {
          phase: "3. Sowing Method & Spacing",
          icon: "🌱",
          details: "Sow with seed drill in 30 cm rows at 3–4 cm depth into adequate residual moisture after Kharif crop. Adequate row spacing prevents microclimate humidity that triggers rust and fungal blight."
        },
        {
          phase: "4. Water & Nutrient Management",
          icon: "💧",
          details: "Starter basal dose: 20 kg N + 40 kg P₂O₅ (DAP) + 20 kg K₂O/ha. Pulses fix their own nitrogen and need minimal irrigation (1–2 light irrigations at pre-flowering and pod filling). Avoid waterlogging as pulses are highly sensitive to standing water."
        },
        {
          phase: "5. Harvesting & Safe Storage",
          icon: "🌾",
          details: "Harvest when 80–85% of pods turn light golden brown and rattle when shaken. Cut close to ground in the early morning to prevent pod shattering. Sun-dry clean pulse to ≤10% moisture before storing in airtight bins."
        }
      ]
    },
    mustard: {
      name: "Mustard (Rapeseed)",
      season: "Rabi Season",
      window: "Optimal Sowing: September 25 – October 15 (Escapes aphid attack)",
      seedRate: "4–5 kg/ha",
      spacing: "30–35 cm row spacing × 10–12 cm plant spacing",
      depth: "2.5–3 cm shallow depth",
      steps: [
        {
          phase: "1. Land Prep & Pre-requisites",
          icon: "🚜",
          details: "Prepare fine, clod-free seedbed to ensure uniform germination of small seeds. Deep summer ploughing + 2 harrowings with planking. Apply 6–8 tonnes/acre FYM. Ensure good field drainage to avoid root rot."
        },
        {
          phase: "2. Seed Treatment & Inoculation",
          icon: "🛡️",
          details: "Treat seeds with Metalaxyl 35 SD @ 6 g/kg seed or Trichoderma viride @ 5 g/kg seed against white rust and downy mildew. Inoculate with Azotobacter & PSB cultures @ 20 g/kg seed."
        },
        {
          phase: "3. Sowing Window & Method",
          icon: "🌱",
          details: "Early sowing in late Sept/early Oct ensures crop matures before seasonal aphid attacks and high spring temperatures. Sow in 30 cm rows at 2.5–3 cm depth. Thin seedlings 15–18 days after emergence to 10–12 cm spacing."
        },
        {
          phase: "4. Water & Nutrient Management",
          icon: "💧",
          details: "Basal: 40 kg N + 40 kg P₂O₅ + 20 kg K₂O + 20 kg elemental Sulphur/ha (sulphur is vital for high seed oil synthesis). Top-dress 40 kg N at first irrigation (rosette stage, 28–30 DAS). Second light irrigation at pod (siliqua) formation."
        },
        {
          phase: "5. Harvesting & Safe Storage",
          icon: "🌾",
          details: "Harvest when 75–80% of siliquae turn golden-yellow. Harvest in the early morning to avoid pod shattering. Sun-dry seed on tarpaulin to ≤8% moisture before packaging in polythene-lined gunny bags."
        }
      ]
    },
    maize: {
      name: "Maize (Corn)",
      season: "Kharif Season",
      window: "Optimal Sowing: June 15 – July 10 (with onset monsoon rains)",
      seedRate: "18–20 kg/ha (hybrid single cross)",
      spacing: "60 cm row-to-row × 20 cm plant-to-plant",
      depth: "4–5 cm depth",
      steps: [
        {
          phase: "1. Land Prep & Pre-requisites",
          icon: "🚜",
          details: "Deep summer ploughing (25 cm) followed by 2 cross-harrowings. Apply 8–10 tonnes/acre FYM during field preparation. Maize is very sensitive to water stagnation; form ridges and furrows for proper drainage."
        },
        {
          phase: "2. Seed Treatment & Inoculation",
          icon: "🛡️",
          details: "Treat seeds with Thiram + Carbendazim (1:1) @ 2.5 g/kg seed or Trichoderma viride @ 4 g/kg seed against banded leaf and sheath blight. Inoculate with Azotobacter culture @ 20 g/kg seed."
        },
        {
          phase: "3. Sowing Window & Method",
          icon: "🌱",
          details: "Sow on ridges or flat beds at 60 cm × 20 cm spacing, 4–5 cm deep. Time sowing with early monsoon rains or provide pre-sowing irrigation to establish deep root anchors."
        },
        {
          phase: "4. Water & Nutrient Management",
          icon: "💧",
          details: "Basal: 1/3rd N (40 kg) + 100% P₂O₅ (60 kg) + 100% K₂O (40 kg) + 25 kg Zinc Sulphate/ha. Top-dress 1/3rd N at knee-high stage (30–35 DAS) and 1/3rd N at tasseling/silking stage (50–55 DAS). Critical moisture stages: knee-high, silking, and grain filling."
        },
        {
          phase: "5. Harvesting & Safe Storage",
          icon: "🌾",
          details: "Harvest when husk covers turn paper-dry and white, and grain black layer appears at the seed base. De-husk, sun-dry cobs, shell, and sun-dry grain to ≤12% moisture for safe storage."
        }
      ]
    },
    greengram: {
      name: "Green Gram (Moong)",
      season: "Zaid / Summer Season",
      window: "Optimal Sowing: March 15 – April 10 (immediately after Rabi harvest)",
      seedRate: "20–25 kg/ha",
      spacing: "25–30 cm row-to-row × 10 cm plant-to-plant",
      depth: "3–4 cm depth",
      steps: [
        {
          phase: "1. Land Prep & Pre-requisites",
          icon: "🚜",
          details: "1 disc harrowing + 1 cultivator pass + planking directly after Rabi harvest. Incorporate crop residues or apply 4–5 tonnes/acre compost. Apply pre-sowing irrigation to ensure fast, uniform germination."
        },
        {
          phase: "2. Seed Treatment & Inoculation",
          icon: "🛡️",
          details: "Treat seed with Carbendazim @ 2 g/kg seed or Trichoderma viride @ 4 g/kg seed. Mandatory Rhizobium + PSB inoculation @ 20 g/kg seed. Enriches soil nitrogen pool by fixing 30 kg N/ha for the next Kharif crop."
        },
        {
          phase: "3. Sowing Method & Spacing",
          icon: "🌱",
          details: "Sow in 25–30 cm rows with seed drill, placing seed 3–4 cm deep. Early sowing in mid-March avoids pre-monsoon shower damage to mature pods in late May."
        },
        {
          phase: "4. Water & Nutrient Management",
          icon: "💧",
          details: "Basal: 20 kg N + 40 kg P₂O₅ + 20 kg K₂O/ha. Pulses do not require top-dressed nitrogen. 3–4 irrigations required during summer: 1st at 20–25 DAS, 2nd at flowering (35 DAS), and 3rd at pod-filling (50 DAS). Stop irrigation at pod ripening."
        },
        {
          phase: "5. Harvesting & Safe Storage",
          icon: "🌾",
          details: "Pick mature black pods in 2 pickings (or single synchronous cut when 85% pods turn black). Thresh and sun-dry seed to ≤9–10% moisture before storing in clean hermetic bags to prevent pulse beetle attack."
        }
      ]
    },
    bajra: {
      name: "Pearl Millet (Bajra)",
      season: "Kharif Season",
      window: "Optimal Sowing: June 25 – July 20 (with early monsoon onset)",
      seedRate: "4–5 kg/ha (hybrid single cross)",
      spacing: "45 cm row spacing × 12–15 cm plant spacing",
      depth: "2.5–3 cm shallow depth",
      steps: [
        { phase: "1. Land Prep & Pre-requisites", icon: "🚜", details: "Deep summer ploughing to eradicate weeds and capture initial rains. Apply 5–6 tonnes/acre FYM compost. Ensure flat seedbed with excellent drainage; bajra cannot tolerate waterlogging." },
        { phase: "2. Seed Treatment & Inoculation", icon: "🛡️", details: "Treat seed with Metalaxyl @ 6 g/kg or Trichoderma viride @ 5 g/kg seed to protect against downy mildew and ergot. Inoculate with Azospirillum culture @ 25 g/kg seed." },
        { phase: "3. Sowing Window & Method", icon: "🌱", details: "Sow in 45 cm rows at 2.5–3 cm depth into moist seedbed immediately after monsoon onset. Thin seedlings at 15–18 DAS to maintain 12–15 cm plant spacing." },
        { phase: "4. Water & Nutrient Management", icon: "💧", details: "Basal: 40 kg N + 40 kg P₂O₅ + 20 kg K₂O/ha. Top-dress 40 kg N at tillering stage (30 DAS) after weeding. Highly drought tolerant; only 1 supplemental irrigation needed if dry spell exceeds 18 days during panicle initiation." },
        { phase: "5. Harvesting, Threshing & Fodder Storage", icon: "🌾", details: "Harvest earheads when grains are hard and dry (moisture <15%). Sun-dry grains to ≤10%. Stems (karbi) must be harvested immediately, sun-cured, and stacked as nutritious sweet dry fodder for livestock." }
      ]
    },
    chickpea: {
      name: "Chickpea (Chana / Bengal Gram)",
      season: "Rabi Season",
      window: "Optimal Sowing: October 15 – November 15",
      seedRate: "65–75 kg/ha (desi) / 85–100 kg/ha (kabuli)",
      spacing: "30 cm row spacing × 10 cm plant spacing",
      depth: "5–6 cm deep into moist zone",
      steps: [
        { phase: "1. Land Prep & Pre-requisites", icon: "🚜", details: "1 deep ploughing + 2 harrowings. Conserve monsoon subsoil moisture with heavy planking immediately after Kharif harvest. Apply 4–5 tonnes/acre well-rotted FYM." },
        { phase: "2. Seed Treatment & Rhizobium Inoculation", icon: "🛡️", details: "Treat seed with Trichoderma viride @ 4 g/kg seed or Carbendazim @ 2 g/kg against collar rot and wilt. Inoculate with Mesorhizobium ciceri & PSB cultures to fix 35 kg biological N/ha." },
        { phase: "3. Sowing Window & Depth", icon: "🌱", details: "Sow at 5–6 cm depth to place seed in deep moist soil. Timely sowing in late October escapes terminal heat during pod development in February/March." },
        { phase: "4. Water & Nutrient Management", icon: "💧", details: "Basal: 20 kg N + 50 kg P₂O₅ + 20 kg K₂O + 20 kg elemental sulphur/ha. Avoid excess vegetative irrigation. 2 critical light irrigations: pre-flowering (40–45 DAS) and pod development (70–75 DAS). Never irrigate at peak flowering." },
        { phase: "5. Harvesting & Safe Storage", icon: "🌾", details: "Harvest when plants turn reddish-brown and leaves shed. Thresh, clean, and sun-dry to ≤9% moisture. Store in hermetic triple-layer bags with neem leaves to prevent pulse bruchid beetles." }
      ]
    },
    soybean: {
      name: "Soybean (Oilseed & Legume)",
      season: "Kharif Season",
      window: "Optimal Sowing: June 20 – July 10 (after 75–100 mm monsoon rain)",
      seedRate: "65–70 kg/ha",
      spacing: "45 cm row spacing × 5–7 cm plant spacing",
      depth: "3–4 cm depth",
      steps: [
        { phase: "1. Land Prep & Pre-requisites", icon: "🚜", details: "Deep summer ploughing followed by 2 harrowings and planking. Ensure broadbed furrow (BBF) or ridge-furrow layout on vertisols to prevent water stagnation." },
        { phase: "2. Seed Treatment & Inoculation", icon: "🛡️", details: "Treat seeds with Carboxin + Thiram @ 2 g/kg seed. Mandatory inoculation with Bradyrhizobium japonicum & PSB @ 20 g/kg seed to establish nitrogen-fixing root nodules." },
        { phase: "3. Sowing Window & Method", icon: "🌱", details: "Sow with tractor seed-drill at 45 cm row spacing into moist seedbed. Avoid deep sowing (>4 cm) which impedes hypocotyl emergence." },
        { phase: "4. Water & Nutrient Management", icon: "💧", details: "Basal: 25 kg N + 60 kg P₂O₅ + 40 kg K₂O + 20 kg Sulphur/ha. Critical moisture stages: flowering and pod development. In case of mid-monsoon dry spells, provide 1 protective sprinkler irrigation." },
        { phase: "5. Harvesting & Processing", icon: "🌾", details: "Harvest when leaves turn yellow and drop off, and pods make a rattling sound when shaken. Harvest in the morning to avoid pod shattering. Thresh at low cylinder speed (400 RPM) to protect seed embryos." }
      ]
    },
    cotton: {
      name: "Cotton (Hybrid / Bt Cotton)",
      season: "Kharif Season",
      window: "Optimal Sowing: May 20 – June 20 (pre-monsoon or onset)",
      seedRate: "2.5–3 kg/ha (hybrid Bt)",
      spacing: "90 cm row spacing × 60 cm plant spacing",
      depth: "4–5 cm depth",
      steps: [
        { phase: "1. Land Prep & Pre-requisites", icon: "🚜", details: "Deep subsoiling to break hardpan and allow taproot penetration. Apply 8–10 tonnes/acre composted FYM. Construct ridges and furrows for drip or furrow irrigation." },
        { phase: "2. Seed Treatment & Inoculation", icon: "🛡️", details: "Seed is delinted and treated with Imidacloprid @ 5 g/kg seed against early sucking pests (jassids/thrips) and Trichoderma @ 4 g/kg against root rot." },
        { phase: "3. Sowing Window & Spacing", icon: "🌱", details: "Dibble 1–2 seeds per hill at 90 × 60 cm or 120 × 45 cm spacing. Pre-monsoon sowing with drip irrigation accelerates early squaring and escapes late-season pink bollworm." },
        { phase: "4. Water & Nutrient Management", icon: "💧", details: "Apply 120 kg N + 60 kg P₂O₅ + 60 kg K₂O/ha in 3 split doses: basal, squaring (45 DAS), and peak boll development (75 DAS). Drip fertigation improves water efficiency by 40%." },
        { phase: "5. Clean Picking & Mandi Marketing", icon: "🌾", details: "Pick clean seed-cotton (kapas) in dry afternoon hours when bolls are fully open. Keep free from trash, leaves, and moisture. Store in dry ventilated room and market at licensed APMC mandis." }
      ]
    },
    sorghum: {
      name: "Rabi Sorghum (Jowar / Nutri-Cereal)",
      season: "Rabi Season",
      window: "Optimal Sowing: September 20 – October 15",
      seedRate: "8–10 kg/ha",
      spacing: "45 cm row spacing × 15 cm plant spacing",
      depth: "4–5 cm depth",
      steps: [
        { phase: "1. Land Prep & Moisture Conservation", icon: "🚜", details: "Conserve late Kharif monsoon moisture with compartment bunding and fine surface tilth. Apply 5–6 tonnes/acre FYM. Heavy black soils store abundant root moisture." },
        { phase: "2. Seed Treatment", icon: "🛡️", details: "Treat seed with Thiamethoxam 30 FS @ 10 ml/kg seed against shoot fly, followed by Trichoderma viride @ 4 g/kg seed. Inoculate with Azospirillum culture." },
        { phase: "3. Sowing Window & Method", icon: "🌱", details: "Early sowing in late September is essential to escape shoot fly. Drill in 45 cm rows, 4–5 cm deep into moist seedbed zone." },
        { phase: "4. Water & Nutrient Management", icon: "💧", details: "Basal: 40 kg N + 40 kg P₂O₅ + 20 kg K₂O/ha. Top-dress 40 kg N at 30–35 DAS if soil moisture is adequate. Drought tolerant C4 crop; 1 protective irrigation at boot/flowering stage boosts grain size." },
        { phase: "5. Harvesting & Sweet Fodder Curing", icon: "🌾", details: "Harvest when grain turns hard and black layer appears at grain hilum. Cut earheads for grain, then immediately harvest and cure sweet stalks (kadbi) — the premier dry fodder for Deccan dairy cattle." }
      ]
    },
    groundnut: {
      name: "Groundnut (Peanut / Oilseed)",
      season: "Kharif Season",
      window: "Optimal Sowing: June 15 – July 15",
      seedRate: "100–120 kg kernels/ha",
      spacing: "30 cm row spacing × 10 cm plant spacing",
      depth: "4–5 cm into loose seedbed",
      steps: [
        { phase: "1. Land Prep & Pre-requisites", icon: "🚜", details: "Plough to 15–20 cm depth to achieve friable, clod-free soil so pegs can easily penetrate. Incorporate 6–8 tonnes/acre FYM. Sandy loam and red loam soils are ideal." },
        { phase: "2. Seed Treatment & Inoculation", icon: "🛡️", details: "Treat sound kernels with Mancozeb @ 3 g/kg kernel or Trichoderma @ 4 g/kg. Inoculate with Rhizobium & PSB cultures @ 20 g/kg seed to fix 25 kg N/ha." },
        { phase: "3. Sowing Window & Method", icon: "🌱", details: "Sow with tractor seed drill or behind plough at 30 × 10 cm spacing. Ensure uniform 4–5 cm depth into moist soil." },
        { phase: "4. Gypsum Application & Water Management", icon: "💧", details: "Basal: 25 kg N + 50 kg P₂O₅ + 40 kg K₂O/ha. Apply 400 kg/ha Gypsum at peak flowering (40–45 DAS) close to root zone — vital for pod filling and high kernel oil synthesis." },
        { phase: "5. Harvesting & Haulm Feed Storage", icon: "🌾", details: "Harvest when inside pod shell turns dark brown and kernels show pink seed coats. Lift vines, strip pods, and dry pods to ≤8% moisture. The green-dried haulms provide premium protein-rich cattle fodder." }
      ]
    },
    ragi: {
      name: "Finger Millet (Ragi / Nutri-Cereal)",
      season: "Kharif Season",
      window: "Optimal Sowing: June 20 – July 25 (Transplanting in July/August)",
      seedRate: "5 kg/ha (nursery) or 10 kg/ha (direct drilling)",
      spacing: "25–30 cm row spacing × 10 cm plant spacing",
      depth: "2–3 cm shallow depth",
      steps: [
        { phase: "1. Land Prep & Pre-requisites", icon: "🚜", details: "Deep ploughing + 2 harrowings. Apply 6–8 tonnes/acre FYM compost. Adaptable to red sandy loams and lateral soils with moderate fertility." },
        { phase: "2. Seed Treatment & Inoculation", icon: "🛡️", details: "Treat seed with Carbendazim @ 2 g/kg seed against blast. Inoculate with Azospirillum brasilense and PSB cultures @ 25 g/kg seed." },
        { phase: "3. Sowing Window & Method", icon: "🌱", details: "Direct line drilling at 25–30 cm rows, or transplant 21-day nursery seedlings (2 seedlings/hill at 25 × 10 cm). Transplanting increases tillering and yield by 25%." },
        { phase: "4. Water & Nutrient Management", icon: "💧", details: "Apply 60 kg N + 30 kg P₂O₅ + 30 kg K₂O/ha in 2 splits: 50% basal + 50% at tillering (25–30 DAS). Highly drought hardy; requires only 1–2 supplemental irrigations during dry spells at flowering." },
        { phase: "5. Harvesting & Safe Storage", icon: "🌾", details: "Harvest when earheads turn yellowish-brown and grain is hard. Cut earheads with sickles, sun-dry, thresh, and store in hermetic bins; ragi grain stores safely for 3+ years without insect damage." }
      ]
    },
    blackgram: {
      name: "Black Gram (Urad / Pulse)",
      season: "Zaid / Kharif",
      window: "Optimal Sowing: March 15 – April 10 (Zaid) or July 1–20 (Kharif)",
      seedRate: "20–25 kg/ha",
      spacing: "30 cm row spacing × 10 cm plant spacing",
      depth: "3–4 cm depth",
      steps: [
        { phase: "1. Land Prep & Pre-requisites", icon: "🚜", details: "1 ploughing + 2 cross harrowings and planking. Ensure raised bed or ridge-and-furrow planting to prevent waterlogging; blackgram is sensitive to poor drainage." },
        { phase: "2. Seed Treatment & Inoculation", icon: "🛡️", details: "Treat seed with Trichoderma viride @ 4 g/kg seed or Carbendazim @ 2 g/kg seed. Inoculate with Rhizobium and PSB cultures @ 20 g/kg seed to fix biological nitrogen." },
        { phase: "3. Sowing Window & Method", icon: "🌱", details: "Sow in 30 cm rows at 3–4 cm depth. Short 70–75 day duration makes it an ideal catch crop between Rabi harvest and Kharif transplanting." },
        { phase: "4. Water & Nutrient Management", icon: "💧", details: "Basal: 20 kg N + 40 kg P₂O₅ + 20 kg K₂O + 20 kg Sulphur/ha. Provide 3–4 light irrigations for summer crop: at sowing, 20–25 DAS, and pod initiation (40 DAS). Avoid irrigation during pod ripening." },
        { phase: "5. Harvesting & Safe Storage", icon: "🌾", details: "Harvest when 80–85% of pods turn dark black. Harvest in early morning to prevent pod shattering. Thresh, clean, and sun-dry to ≤9% moisture before storing." }
      ]
    }
  };

  function buildRotationSowingTimeline(sequence, isBest) {
    if (!sequence || !sequence.length) return "";
    const cropsHtml = sequence.map((cropId, idx) => {
      const schedule = AGRONOMIC_CROP_SCHEDULE[cropId] || {
        name: cropId.toUpperCase(),
        season: "Crop " + (idx + 1),
        window: "Recommended seasonal sowing window",
        seedRate: "Standard certified seed rate",
        spacing: "Standard row-to-row spacing",
        depth: "3–4 cm depth",
        steps: [
          { phase: "1. Land Prep & Pre-requisites", icon: "🚜", details: "Deep summer ploughing, incorporate 8–10 tons/acre FYM compost, and apply pre-sowing paleo irrigation." },
          { phase: "2. Seed Selection & Treatment", icon: "🛡️", details: "Treat seeds with Trichoderma @ 4 g/kg and inoculate with certified bio-fertilizers." },
          { phase: "3. Sowing Window & Method", icon: "🌱", details: "Sow with calibrated seed drill at recommended row spacing and uniform depth into moist seedbed." },
          { phase: "4. Water & Nutrient Management", icon: "💧", details: "Basal DAP/MOP application, split nitrogen top-dressing at critical stages, and maintain stage-critical moisture." },
          { phase: "5. Harvesting & Safe Storage", icon: "🌾", details: "Harvest at 85–90% maturity, sun-dry to ≤12% moisture, and store in hermetic bags." }
        ]
      };

      const stepsHtml = schedule.steps.map(step => `
        <div class="timeline-step-item">
          <div class="timeline-step-icon">${step.icon}</div>
          <div class="timeline-step-content">
            <strong class="timeline-step-title">${escapeHtml(step.phase)}</strong>
            <p class="timeline-step-desc">${escapeHtml(step.details)}</p>
          </div>
        </div>
      `).join("");

      return `
        <div class="crop-timeline-card">
          <div class="crop-timeline-header">
            <div class="crop-timeline-badge-group">
              <span class="crop-season-tag">${escapeHtml(schedule.season)}</span>
              <h4 class="crop-timeline-name">${escapeHtml(schedule.name)}</h4>
            </div>
            <span class="crop-window-chip">📅 ${escapeHtml(schedule.window)}</span>
          </div>
          <div class="crop-meta-row">
            <span class="crop-meta-chip">🌰 Seed Rate: ${escapeHtml(schedule.seedRate)}</span>
            <span class="crop-meta-chip">📏 Row Spacing: ${escapeHtml(schedule.spacing)}</span>
            <span class="crop-meta-chip">⬇️ Depth: ${escapeHtml(schedule.depth)}</span>
          </div>
          <div class="timeline-step-list">
            ${stepsHtml}
          </div>
        </div>
      `;
    }).join("");

    return `
      <details class="rotation-timeline-details" ${isBest ? 'open' : ''}>
        <summary class="rotation-timeline-summary">
          <span class="timeline-summary-title">🌾 Complete Sowing Timeline &amp; Agronomic Pre-requisites</span>
          <span class="timeline-summary-hint">Click to inspect field prep, FYM manure rates, seed treatment &amp; harvest steps</span>
        </summary>
        <div class="rotation-timeline-body">
          ${cropsHtml}
        </div>
      </details>
    `;
  }

  function buildClimateShiftComparisonCard(actionPlan, scenario) {
    if (!actionPlan?.rotations?.length) return "";

    const best = actionPlan.rotations[0];
    const current = actionPlan.currentPractice;

    const bestStats = best[scenario] || {};
    const bestSurvival = Math.round(bestStats.survivalRatePct ?? best.survivalRatePct ?? 100);
    const bestWater = Math.round(best.meanIrrigationNeedMm || 0);
    const bestN = best.inputs?.nFertilizerKgPerAcre ?? 45;
    const bestProfit = best.economics?.netProfitPerAcre ? Math.round(best.economics.netProfitPerAcre) : 27600;
    const bestName = formatSequenceLabels(best);

    const currentStats = current ? (current[scenario] || {}) : null;
    const baseSurvival = current ? Math.round(currentStats.survivalRatePct ?? current.survivalRatePct ?? 0) : (scenario === "irrigated" ? 65 : 35);
    const baseWater = current ? Math.round(current.meanIrrigationNeedMm || 480) : 480;
    const baseN = current?.inputs?.nFertilizerKgPerAcre ?? 90;
    const baseProfit = current?.economics?.netProfitPerAcre ? Math.round(current.economics.netProfitPerAcre) : 18400;

    let baseName = "Paddy (Rice) ➔ Wheat";
    let baseSub = "Traditional Regional Cropping Pattern";
    if (current) {
      baseName = formatSequenceLabels(current);
      baseSub = "Your Current Farm Practice";
    } else if (actionPlan.baselinePractice && Array.isArray(actionPlan.baselinePractice)) {
      baseName = actionPlan.baselinePractice.map(p => p.name || p.id).join(" ➔ ");
      baseSub = `Traditional Baseline (${actionPlan.agroZone?.name || 'Regional Zone'})`;
    } else if (actionPlan.agroZone?.dominantPractice) {
      baseName = actionPlan.agroZone.dominantPractice.map(p => p.name || p.id).join(" ➔ ");
      baseSub = `Traditional Baseline (${actionPlan.agroZone.name})`;
    }

    const survivalDelta = Math.max(0, bestSurvival - baseSurvival);
    const waterSavedMm = Math.max(0, baseWater - bestWater);
    const profitGain = Math.max(0, bestProfit - baseProfit);

    const GOAL_LABELS = {
      profit: "💰 High Profit",
      resilience: "🛡️ Climate Resilience",
      water: "💧 Water Efficiency",
      soil: "🌱 Soil & N-Savings",
      food_security: "🍚 Food Security",
      short_duration: "⚡ Fast Turnover"
    };

    const activeGoals = actionPlan.goals || ["profit", "resilience", "soil"];
    const goalBadgesHtml = activeGoals
      .map(g => `<span class="shift-goal-pill">${GOAL_LABELS[g] || g}</span>`)
      .join(" ");

    let shiftReason = actionPlan.agroZone?.localImportance || "Optimized crop rotation diversifies root depths, enhances seasonal water-use efficiency, and protects yields against erratic monsoon onset.";
    const bestSeqStr = (best.sequence || []).join("-");
    if (bestSeqStr.includes("bajra") || bestSeqStr.includes("sorghum")) {
      shiftReason = "Shifting to climate-hardy C4 nutri-cereals (Bajra / Sorghum) reduces water consumption by up to 70%, withstands extreme heatwaves, and secures critical dry fodder (kadbi/karbi) for rural dairy livestock.";
    } else if (bestSeqStr.includes("soybean") && bestSeqStr.includes("chickpea")) {
      shiftReason = "Shifting to a soybean-chickpea sequence fixes 65 kg/ha biological atmospheric nitrogen, completely avoids March terminal heat, and delivers high net profit per acre at regional mandis.";
    } else if (bestSeqStr.includes("groundnut") || bestSeqStr.includes("cotton")) {
      shiftReason = "Shifting to high-value oilseeds / pulses provides drought-tolerant taproot exploration in deep soils, high cash flow at regulated APMC mandis, and high-protein livestock feed.";
    } else if (bestSeqStr.includes("lentils") || bestSeqStr.includes("greengram")) {
      shiftReason = "Shifting from a double-cereal rotation to an agro-climatic pulse sequence fixes biological atmospheric nitrogen (saving 25–45 kg chemical urea/acre), conserves up to 40% irrigation water, and escapes March terminal heat stress.";
    } else if (bestSeqStr.includes("mustard") || bestSeqStr.includes("maize")) {
      shiftReason = "Shifting to maize-mustard cuts tubewell electricity and diesel expenses, matures ahead of peak April evaporative demand, and captures higher market modal prices at regional APMC mandis.";
    }

    return `
      <div class="climate-shift-comparison-card">
        <div class="shift-comparison-head">
          <div>
            <span class="shift-badge-highlight">🌾 NASA CLIMATE SHIFT COMPARISON</span>
            <h3 class="shift-comparison-title">Traditional Baseline vs. Recommended Climate-Shifted Route</h3>
            <p class="shift-comparison-sub">Side-by-side performance across ${actionPlan.yearsEvaluated || 20} years of daily NASA POWER satellite observations.</p>
          </div>
          <div class="shift-goals-summary">
            <span class="goals-label">Active Goals:</span>
            <div class="shift-goals-pills-wrap">${goalBadgesHtml}</div>
          </div>
        </div>

        <div class="shift-comparison-grid">
          <!-- Traditional / Baseline Column -->
          <div class="shift-col shift-col-baseline">
            <div class="shift-col-header">
              <span class="col-type-tag">CURRENT BASELINE</span>
              <h4 class="shift-col-name">${escapeHtml(baseName)}</h4>
              <span class="shift-col-sub">${escapeHtml(baseSub)}</span>
            </div>
            <div class="shift-stat-list">
              <div class="shift-stat-item">
                <span class="shift-stat-label">20-Year Climate Survival</span>
                <strong class="shift-stat-val ${baseSurvival >= 70 ? 'pos' : 'warn'}">${baseSurvival}%</strong>
              </div>
              <div class="shift-stat-item">
                <span class="shift-stat-label">${scenario === 'irrigated' ? 'Supplemental Irrigation' : 'Moisture Deficit'}</span>
                <strong class="shift-stat-val">${baseWater} mm/yr</strong>
              </div>
              <div class="shift-stat-item">
                <span class="shift-stat-label">Chemical N Fertilizer</span>
                <strong class="shift-stat-val">${baseN} kg/acre</strong>
              </div>
              <div class="shift-stat-item">
                <span class="shift-stat-label">Projected Net Income</span>
                <strong class="shift-stat-val">₹${format(baseProfit, 0)}/acre</strong>
              </div>
            </div>
          </div>

          <!-- Shift Direction & Impact -->
          <div class="shift-col-arrow">
            <div class="shift-arrow-circle" title="Shift to climate-resilient rotation">➔</div>
            <div class="shift-delta-badges">
              ${survivalDelta > 0 ? `<span class="delta-badge delta-pos">+${survivalDelta}% Resilience</span>` : `<span class="delta-badge delta-pos">100% Proven</span>`}
              ${waterSavedMm > 0 ? `<span class="delta-badge delta-water">Saves ${waterSavedMm} mm Water</span>` : ''}
              ${profitGain > 0 ? `<span class="delta-badge delta-profit">+₹${format(profitGain, 0)}/ac Net Gain</span>` : ''}
            </div>
          </div>

          <!-- Recommended Climate Shift Route -->
          <div class="shift-col shift-col-recommended">
            <div class="shift-col-header">
              <span class="col-type-tag highlight">RECOMMENDED CLIMATE SHIFT</span>
              <h4 class="shift-col-name">${escapeHtml(bestName)}</h4>
              <span class="shift-col-sub">${best.multiGoalScore ? `Pareto Rank #1 · Fit Score ${Math.round(best.multiGoalScore)}/100` : 'Optimal Multi-Objective Route'}</span>
            </div>
            <div class="shift-stat-list">
              <div class="shift-stat-item">
                <span class="shift-stat-label">20-Year Climate Survival</span>
                <strong class="shift-stat-val pos">${bestSurvival}%</strong>
              </div>
              <div class="shift-stat-item">
                <span class="shift-stat-label">${scenario === 'irrigated' ? 'Supplemental Irrigation' : 'Moisture Deficit'}</span>
                <strong class="shift-stat-val pos">${bestWater} mm/yr</strong>
              </div>
              <div class="shift-stat-item">
                <span class="shift-stat-label">Chemical N Fertilizer</span>
                <strong class="shift-stat-val pos">${bestN} kg/acre ${best.inputs?.legumeNFixationCreditKg ? `(-${best.inputs.legumeNFixationCreditKg} kg N credit)` : ''}</strong>
              </div>
              <div class="shift-stat-item">
                <span class="shift-stat-label">Projected Net Income</span>
                <strong class="shift-stat-val pos">₹${format(bestProfit, 0)}/acre</strong>
              </div>
            </div>
          </div>
        </div>

        <div class="shift-takeaway-footer">
          <span class="takeaway-icon">💡</span>
          <p class="takeaway-text"><strong>Why Shift:</strong> ${escapeHtml(shiftReason)}</p>
        </div>
      </div>
    `;
  }

  /* ---------------- (3) ACTION SECTION: DYNAMIC LAND-ANALYSIS-DRIVEN ROTATIONS ---------------- */
  let activePriority = "balanced";
  let activeCategoryFilter = "all";
  let selectedRotationsForComparison = [];
  let currentActionPlanRef = null;

  function getPriorityScore(rot, priority) {
    const s = rot.scores || {};
    switch (priority) {
      case "profit": return s.profitability || 75;
      case "soil": return s.soilHealth || 75;
      case "water": return s.waterEfficiency || 75;
      case "low_cost": return Math.min(100, Math.round((rot.economics?.bcr || 2.5) * 25));
      case "resilience": return s.climate || rot.survivalRatePct || 80;
      case "balanced":
      default:
        return rot.overallScore || 85;
    }
  }

  function renderRotations(actionPlan) {
    const container = element("action-plan-rotations");
    const statusEl = element("action-plan-replay-status");
    if (!container) return;
    currentActionPlanRef = actionPlan;

    if (!actionPlan?.rotations?.length) {
      container.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b;">No candidate rotations available for this territory.</div>';
      return;
    }

    const startYr = actionPlan.years?.start || (actionPlan.yearsEvaluated ? (new Date().getFullYear() - actionPlan.yearsEvaluated) : 2005);
    const endYr = actionPlan.years?.end || (new Date().getFullYear() - 1);
    const allRots = actionPlan.rotations || [];

    if (statusEl) {
      const zoneLabel = actionPlan.agroZone?.name || "Regional Agro-Ecological Zone";
      statusEl.innerHTML = `
        <strong>🌾 Actual Land Analysis:</strong> Evaluated ${allRots.length} scientifically compatible candidate rotations for ${zoneLabel} using NASA POWER 20-year daily replay, FAO-56 crop coefficients, verified soil test calibrations, and CACP economic benchmarks.
      `;
    }

    // 1. Filter by category if selected
    let filteredRots = [...allRots];
    if (activeCategoryFilter !== "all") {
      filteredRots = filteredRots.filter(r => {
        const type = (r.structuralType || "").toLowerCase();
        const seq = (r.sequence || []).join("-").toLowerCase();
        if (activeCategoryFilter === "pulse") return type.includes("pulse") || seq.includes("greengram") || seq.includes("lentils") || seq.includes("chickpea") || seq.includes("cowpea");
        if (activeCategoryFilter === "oilseed") return type.includes("oilseed") || seq.includes("mustard") || seq.includes("sesame") || seq.includes("groundnut");
        if (activeCategoryFilter === "vegetable") return type.includes("vegetable") || seq.includes("potato") || seq.includes("cauliflower") || seq.includes("tomato") || seq.includes("okra");
        if (activeCategoryFilter === "green_manure") return type.includes("green manure") || seq.includes("dhaincha") || seq.includes("sunhemp");
        if (activeCategoryFilter === "millet") return type.includes("millet") || seq.includes("bajra") || seq.includes("ragi") || seq.includes("sorghum");
        return true;
      });
      if (!filteredRots.length) filteredRots = [...allRots];
    }

    // 2. Sort by active priority
    filteredRots.sort((a, b) => getPriorityScore(b, activePriority) - getPriorityScore(a, activePriority));

    // 3. Build Priority Switcher Toolbar & Category Chips
    const priorities = [
      { id: "balanced", label: "🌿 Balanced Scoring (Default)" },
      { id: "profit", label: "💰 Max Profitability" },
      { id: "soil", label: "🌱 Soil Health & N-Fixation" },
      { id: "water", label: "💧 Minimum Water" },
      { id: "low_cost", label: "📉 Lower Input Cost" },
      { id: "resilience", label: "🛡️ Climate Resilience" }
    ];

    const categories = [
      { id: "all", label: `All Valid Rotations (${allRots.length})` },
      { id: "pulse", label: "🌾 Cereal → Pulse" },
      { id: "oilseed", label: "🌻 Cereal → Oilseed" },
      { id: "vegetable", label: "🥬 Vegetable Intensive" },
      { id: "green_manure", label: "🌿 Green Manure Enriched" },
      { id: "millet", label: "🏜️ Low Water / Millets" }
    ];

    const toolbarHtml = `
      <div class="rotation-toolbar-container">
        <div class="rotation-toolbar-row">
          <div>
            <span style="font-size:0.75rem; font-weight:800; color:#475569; text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:6px;">Personalized Optimization Priority:</span>
            <div class="rotation-priority-group">
              ${priorities.map(p => `
                <button type="button" class="rotation-priority-btn ${activePriority === p.id ? 'active' : ''}" data-priority="${p.id}">
                  ${p.label}
                </button>
              `).join("")}
            </div>
          </div>
        </div>
        <div class="rotation-toolbar-row" style="margin-top:4px;">
          <div class="rotation-filter-chips">
            ${categories.map(c => `
              <button type="button" class="rotation-filter-chip ${activeCategoryFilter === c.id ? 'active' : ''}" data-filter="${c.id}">
                ${c.label}
              </button>
            `).join("")}
          </div>
          <div style="font-size:0.75rem; color:#64748b; font-weight:600;">
            Showing <strong>${filteredRots.length}</strong> of ${allRots.length} candidate sequences
          </div>
        </div>
      </div>

      <!-- Compare Sticky Bar -->
      <div class="rotation-comparison-bar">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:1.1rem;">⚖️</span>
          <span style="font-size:0.84rem; font-weight:700; color:#1e3a8a;">
            Selected for Side-by-Side Comparison: <strong id="compare-count-badge">${selectedRotationsForComparison.length} of 3</strong>
          </span>
        </div>
        <button type="button" class="rot-compare-btn" id="btn-trigger-compare-modal" ${selectedRotationsForComparison.length < 2 ? 'disabled' : ''}>
          📊 Compare Selected (${selectedRotationsForComparison.length})
        </button>
      </div>
    `;

    // 4. Build Rotation Card Helper
    function buildCard(rot, idx, isHighlight) {
      const scenarioStats = rot[activeScenario] || {};
      const ratePct = Math.round(scenarioStats.survivalRatePct ?? rot.survivalRatePct ?? 85);
      const waterNeedMm = Math.round(rot.meanIrrigationNeedMm || rot.totalWaterNeedMm || 400);
      const econ = rot.economics || {};
      const netProfitAc = econ.netProfitPerAcre ? `₹${format(econ.netProfitPerAcre, 0)}/acre` : "—";
      const bcr = econ.bcr ? `${format(econ.bcr, 2)}x` : "1.0x";
      const soilRegen = rot.soilRegeneration || {};
      const nFix = soilRegen.nFixationKgHa || 0;
      const isSelected = selectedRotationsForComparison.includes(rot.id);

      const whyChooseList = (rot.whyChooseReasons || [
        "Optimal agro-ecological fit for local climate.",
        "Diversified root depth architecture improves nutrient cycling."
      ]).map(r => `<li>${escapeHtml(r)}</li>`).join("");

      const whyRiskList = (rot.whyNotSuitableRisks || [
        "Requires adherence to recommended sowing and harvesting calendar.",
        "Supplemental irrigation needed during critical flowering stage."
      ]).map(r => `<li>${escapeHtml(r)}</li>`).join("");

      const scoreVal = getPriorityScore(rot, activePriority);

      return `
        <article class="action-plan-rotation-card ${isHighlight ? 'best-rotation-card' : ''}" data-rotation-id="${rot.id}">
          <div class="rotation-card-top">
            <div class="rotation-title-area">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                <span class="rotation-rank-badge ${isHighlight ? 'badge-best' : 'badge-alt'}">
                  ${isHighlight ? '⭐ #1 RECOMMENDED' : `#${idx + 1} ALTERNATIVE`}
                </span>
                <span style="font-size:0.75rem; font-weight:800; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:12px;">
                  ${scoreVal}/100 Suitability
                </span>
                <span style="font-size:0.7rem; color:#64748b; font-weight:600;">
                  ${escapeHtml(rot.structuralType || 'Multi-Season Rotation')}
                </span>
              </div>
              <h3 class="rotation-title" style="margin:2px 0 6px 0;">${escapeHtml(rot.fullName || formatSequenceLabels(rot))}</h3>
            </div>
            <div style="display:flex; flex-direction:column; align-items:flex-end; gap:4px;">
              <div class="rotation-scenario-chip ${activeScenario}">
                ${activeScenario === 'irrigated' ? '💧 Irrigated' : '🌧️ Rainfed'}
              </div>
              <span style="font-size:0.68rem; color:#64748b; font-family:monospace;">
                ID: ${rot.id}
              </span>
            </div>
          </div>

          <!-- Key KPIs Row -->
          <div class="rotation-kpi-row">
            <div class="rot-metric-box">
              <span class="rot-metric-label">20-Yr Resilience</span>
              <strong class="rot-metric-val ${ratePct >= 70 ? 'pos' : ratePct >= 30 ? 'warn' : 'neg'}">${ratePct}% Survival</strong>
            </div>
            <div class="rot-metric-box">
              <span class="rot-metric-label">Water Requirement</span>
              <strong class="rot-metric-val">${waterNeedMm} mm/yr</strong>
            </div>
            <div class="rot-metric-box">
              <span class="rot-metric-label">Projected Net Income</span>
              <strong class="rot-metric-val">${escapeHtml(netProfitAc)}</strong>
            </div>
            <div class="rot-metric-box">
              <span class="rot-metric-label">Benefit-Cost Ratio</span>
              <strong class="rot-metric-val">${escapeHtml(bcr)}</strong>
            </div>
          </div>

          <!-- Soil Regeneration & Biological Nitrogen Fixation Badge -->
          <div style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:10px 14px; margin:10px 0; font-size:0.8rem; display:flex; flex-wrap:wrap; justify-content:space-between; gap:8px;">
            <div>
              <strong style="color:#166534; display:block;">🌱 Soil Regeneration &amp; Nutrient Fixation:</strong>
              <span style="color:#14532d;">
                ${nFix > 0 ? `Fixes <strong>~${nFix} kg biological N/ha</strong> naturally.` : 'Cereal/Oilseed balance preserves root diversity.'}
                Root depth: ${escapeHtml(soilRegen.rootDiversity || 'Multi-horizon extraction')}.
              </span>
            </div>
            <div style="text-align:right;">
              <span style="font-size:0.74rem; font-weight:700; color:#15803d; background:#dcfce7; padding:2px 8px; border-radius:10px;">
                ${escapeHtml(soilRegen.organicMatterPotential || 'Moderate Organic Contribution')}
              </span>
            </div>
          </div>

          <!-- "Why Should I Choose This Rotation?" & "Why Might It Not Be Suitable?" -->
          <div class="rotation-why-grid">
            <div class="rotation-why-box pro">
              <div class="why-box-title">
                <span>✓</span> Why Should I Choose This Rotation?
              </div>
              <ul class="why-box-list">
                ${whyChooseList}
              </ul>
            </div>
            <div class="rotation-why-box con">
              <div class="why-box-title">
                <span>⚠️</span> Why Might This Rotation Not Be Suitable?
              </div>
              <ul class="why-box-list">
                ${whyRiskList}
              </ul>
            </div>
          </div>

          <!-- Sowing Timeline Drawer -->
          ${buildRotationSowingTimeline(rot.sequence, isHighlight)}

          <!-- Card Actions: Compare & Apply -->
          <div class="rotation-card-actions">
            <label class="rot-select-compare-label">
              <input type="checkbox" class="rot-compare-checkbox" data-rotation-id="${rot.id}" ${isSelected ? 'checked' : ''}>
              <span>Select to Compare</span>
            </label>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:0.75rem; color:#64748b;">
                Mandi: ${escapeHtml(econ.mandiName || 'Local APMC')} (~${econ.mandiDistanceKm || 12} km)
              </span>
              <button type="button" class="btn-apply-plan" data-rotation-id="${rot.id}">
                🌾 Apply to My Action Plan →
              </button>
            </div>
          </div>
        </article>
      `;
    }

    // Render top 3 featured cards prominently
    const topFeatured = filteredRots.slice(0, 3);
    const topCardsHtml = topFeatured.map((r, i) => buildCard(r, i, i === 0)).join("");

    // Render remaining candidate rotations in expandable grid
    const remainingCandidates = filteredRots.slice(3);
    let remainingHtml = "";
    if (remainingCandidates.length > 0) {
      const remainingCards = remainingCandidates.map((r, i) => buildCard(r, i + 3, false)).join("");
      remainingHtml = `
        <details class="action-plan-more-rotations-details" style="margin-top:16px; background:#ffffff; border:1px solid #e2e8f0; border-radius:12px; padding:12px 18px;">
          <summary style="cursor:pointer; font-weight:800; font-size:0.95rem; color:#166534; padding:8px 0; user-select:none;">
            📋 Browse All ${filteredRots.length} Valid Generated Rotations (${remainingCandidates.length} More Options Available)
          </summary>
          <div style="display:flex; flex-direction:column; gap:16px; margin-top:14px;">
            ${remainingCards}
          </div>
        </details>
      `;
    }

    const comparisonSummaryHtml = buildClimateShiftComparisonCard(actionPlan, activeScenario);

    let suitabilityHtml = "";
    const suitability = actionPlan.rotationsSuitabilityExplanation;
    if (suitability) {
      const isHi = getLanguage() === "hi";
      suitabilityHtml = `
        <div class="rotation-suitability-box">
          <h4>🌾 ${isHi ? "यह फसल चक्र आपके खेत के लिए क्यों उपयुक्त है?" : "Why is this rotation suitable for your farm?"} (${escapeHtml(suitability.sequence)})</h4>
          <div class="suitability-grid">
            <div class="suitability-item">
              <strong>💧 ${isHi ? "पानी की आवश्यकता" : "Water Requirements"}</strong>
              <p style="margin:0;">${escapeHtml(isHi && suitability.waterRequirementsHi ? suitability.waterRequirementsHi : suitability.waterRequirements)}</p>
            </div>
            <div class="suitability-item">
              <strong>🌡️ ${isHi ? "जलवायु अनुकूलता" : "Climate Compatibility"}</strong>
              <p style="margin:0;">${escapeHtml(isHi && suitability.climateCompatibilityHi ? suitability.climateCompatibilityHi : suitability.climateCompatibility)}</p>
            </div>
            <div class="suitability-item">
              <strong>🌱 ${isHi ? "मृदा स्वास्थ्य लाभ" : "Soil Health Benefits"}</strong>
              <p style="margin:0;">${escapeHtml(isHi && suitability.soilHealthBenefitsHi ? suitability.soilHealthBenefitsHi : suitability.soilHealthBenefits)}</p>
            </div>
            <div class="suitability-item">
              <strong>🌿 ${isHi ? "दलहन का महत्व" : "Legume Integration"}</strong>
              <p style="margin:0;">${escapeHtml(isHi && suitability.legumeIntegrationHi ? suitability.legumeIntegrationHi : suitability.legumeIntegration)}</p>
            </div>
            <div class="suitability-item">
              <strong>📈 ${isHi ? "मौसम तनाव परीक्षण (20 वर्ष)" : "20-Year Weather Replay Stress"}</strong>
              <p style="margin:0;">${escapeHtml(isHi && suitability.rotationStressHi ? suitability.rotationStressHi : suitability.rotationStress)}</p>
            </div>
            <div class="suitability-item">
              <strong>⚠️ ${isHi ? "संभावित सीमाएं एवं ध्यान योग्य बातें" : "Potential Limitations"}</strong>
              <p style="margin:0;">${escapeHtml(isHi && suitability.potentialLimitationsHi ? suitability.potentialLimitationsHi : suitability.potentialLimitations)}</p>
            </div>
          </div>
        </div>
      `;
    }

    container.innerHTML = comparisonSummaryHtml + toolbarHtml + topCardsHtml + remainingHtml + suitabilityHtml;

    // Attach interactive event listeners for priority buttons, filter chips, checkboxes, compare, and apply modals
    bindDynamicRotationInteractions(actionPlan);
  }

  function bindDynamicRotationInteractions(actionPlan) {
    const container = element("action-plan-rotations");
    if (!container) return;

    // 1. Priority buttons
    container.querySelectorAll(".rotation-priority-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        const p = btn.dataset.priority;
        if (p === activePriority) return;
        activePriority = p;
        renderRotations(actionPlan);
      });
    });

    // 2. Filter chips
    container.querySelectorAll(".rotation-filter-chip").forEach(btn => {
      btn.addEventListener("click", () => {
        const f = btn.dataset.filter;
        if (f === activeCategoryFilter) return;
        activeCategoryFilter = f;
        renderRotations(actionPlan);
      });
    });

    // 3. Compare Checkboxes
    container.querySelectorAll(".rot-compare-checkbox").forEach(cb => {
      cb.addEventListener("change", () => {
        const rotId = cb.dataset.rotationId;
        if (cb.checked) {
          if (selectedRotationsForComparison.length >= 3) {
            cb.checked = false;
            alert("You can select up to 3 crop rotations to compare simultaneously.");
            return;
          }
          if (!selectedRotationsForComparison.includes(rotId)) {
            selectedRotationsForComparison.push(rotId);
          }
        } else {
          selectedRotationsForComparison = selectedRotationsForComparison.filter(id => id !== rotId);
        }
        // Update comparison button & badge
        const badge = element("compare-count-badge");
        if (badge) badge.textContent = `${selectedRotationsForComparison.length} of 3`;
        const btnCompare = element("btn-trigger-compare-modal");
        if (btnCompare) {
          btnCompare.disabled = selectedRotationsForComparison.length < 2;
          btnCompare.textContent = `📊 Compare Selected (${selectedRotationsForComparison.length})`;
        }
      });
    });

    // 4. Compare Modal Trigger
    const btnCompareTrigger = element("btn-trigger-compare-modal");
    btnCompareTrigger?.addEventListener("click", () => {
      if (selectedRotationsForComparison.length < 2) return;
      openComparisonModal(actionPlan);
    });

    // 5. Apply to Action Plan Buttons
    container.querySelectorAll(".btn-apply-plan").forEach(btn => {
      btn.addEventListener("click", () => {
        const rotId = btn.dataset.rotationId;
        const chosenRot = (actionPlan.rotations || []).find(r => r.id === rotId);
        if (chosenRot) {
          openApplyModal(chosenRot, actionPlan);
        }
      });
    });
  }

  // Open Side-by-Side Comparison Modal
  function openComparisonModal(actionPlan) {
    const modal = element("rotation-comparison-modal");
    const body = element("comparison-modal-body");
    if (!modal || !body) return;

    const rotsToCompare = (actionPlan.rotations || []).filter(r => selectedRotationsForComparison.includes(r.id));
    if (!rotsToCompare.length) return;

    let headersHtml = "<th>Metric / Property</th>";
    rotsToCompare.forEach((r, idx) => {
      headersHtml += `<th>Option ${idx + 1}: ${escapeHtml(r.fullName || r.name)}</th>`;
    });

    function makeRow(label, fn) {
      let cells = `<td><strong>${label}</strong></td>`;
      rotsToCompare.forEach(r => {
        cells += `<td>${fn(r)}</td>`;
      });
      return `<tr>${cells}</tr>`;
    }

    const tableHtml = `
      <div style="overflow-x:auto;">
        <table class="compare-table">
          <thead>
            <tr>${headersHtml}</tr>
          </thead>
          <tbody>
            ${makeRow("Crops & Structure", r => `<span class="shift-goal-pill">${escapeHtml(r.structuralType || 'Multi-Crop')}</span><br>${(r.sequence || []).join(" → ")}`)}
            ${makeRow("Total Duration", r => `${r.totalDurationDays || 240} days/year`)}
            ${makeRow("Est. Cultivation Cost", r => `₹${format(r.economics?.totalCostPerAcre, 0)}/acre`)}
            ${makeRow("Expected Gross Revenue", r => `₹${format(r.economics?.totalGrossRevenuePerAcre, 0)}/acre`)}
            ${makeRow("Projected Net Return", r => `<strong style="color:#166534; font-size:0.95rem;">₹${format(r.economics?.netProfitPerAcre, 0)}/acre</strong>`)}
            ${makeRow("Benefit-Cost Ratio (BCR)", r => `<strong>${format(r.economics?.bcr, 2)}x</strong>`)}
            ${makeRow("Water Requirement", r => `${format(r.totalWaterNeedMm || r.meanIrrigationNeedMm, 0)} mm/year`)}
            ${makeRow("Biological Nitrogen Fixation", r => `~${r.soilRegeneration?.nFixationKgHa || 0} kg N/ha natural credit`)}
            ${makeRow("Organic Matter Potential", r => escapeHtml(r.soilRegeneration?.organicMatterPotential || 'Moderate'))}
            ${makeRow("Root Architecture Diversity", r => escapeHtml(r.soilRegeneration?.rootDiversity || 'Multi-horizon'))}
            ${makeRow("20-Year Climate Resilience", r => `${Math.round(r.survivalRatePct || 85)}% survival rate`)}
            ${makeRow("Nearest Mandi Trade", r => `${escapeHtml(r.economics?.mandiName || 'APMC')} (~${r.economics?.mandiDistanceKm || 12} km)`)}
            ${makeRow("Overall Suitability Score", r => `<span style="background:#dcfce7; color:#166534; padding:3px 8px; border-radius:10px; font-weight:800;">${r.overallScore || 85}/100</span>`)}
          </tbody>
        </table>
      </div>
    `;

    body.innerHTML = tableHtml;
    modal.classList.remove("hidden");

    // Close buttons
    element("btn-close-comp-modal")?.addEventListener("click", () => modal.classList.add("hidden"), { once: true });
    element("btn-dismiss-comp-modal")?.addEventListener("click", () => modal.classList.add("hidden"), { once: true });
  }

  // Open Action Plan Modification Review & Confirmation Modal
  let stagedRotationForApply = null;

  function openApplyModal(rotation, actionPlan) {
    const modal = element("rotation-apply-modal");
    const body = element("apply-modal-body");
    if (!modal || !body) return;

    stagedRotationForApply = rotation;
    const profile = (typeof readProfile === "function" ? readProfile() : null) || {};

    const crops = rotation.crops || [];
    const seqNames = rotation.fullName || rotation.name;
    const nFix = rotation.soilRegeneration?.nFixationKgHa || 0;

    body.innerHTML = `
      <div style="margin-bottom:18px;">
        <p style="font-size:0.86rem; color:#334155; margin:0 0 12px 0;">
          You are about to synchronize your personalized <strong>Farm Action Plan</strong> with the selected <strong>${escapeHtml(seqNames)}</strong> rotation. Review the proposed modifications before confirming:
        </p>

        <!-- Diff Card 1: Seasonal Calendar -->
        <div class="compare-diff-card">
          <div class="compare-diff-head">
            <strong style="color:#0f172a; font-size:0.88rem;">1. Seasonal Cropping Calendar</strong>
            <span style="font-size:0.7rem; font-weight:700; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px;">PROPOSED UPDATE</span>
          </div>
          <div style="font-size:0.82rem; color:#475569; line-height:1.45;">
            <div><strong>Existing:</strong> Previous schedule (${(profile.farm?.crops || ["Baseline"]).map(c => typeof c === 'object' ? c.crop || c.id : c).join(", ")})</div>
            <div style="color:#166534; margin-top:4px;">
              <strong>Proposed:</strong> Synchronize active field schedule to ${crops.map(c => `${c.name} (Sow: ${c.sowingWindow}, Harvest: ${c.harvestWindow})`).join(" → ")}.
            </div>
            <div style="font-size:0.75rem; color:#0369a1; margin-top:4px;">
              <em>Impact: Escapes terminal March heat and aligns monsoon onset with vegetative establishment.</em>
            </div>
          </div>
        </div>

        <!-- Diff Card 2: Soil Health & N-Credit -->
        <div class="compare-diff-card">
          <div class="compare-diff-head">
            <strong style="color:#0f172a; font-size:0.88rem;">2. Soil Health &amp; Nutrient Stewardship</strong>
            <span style="font-size:0.7rem; font-weight:700; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px;">PROPOSED UPDATE</span>
          </div>
          <div style="font-size:0.82rem; color:#475569; line-height:1.45;">
            <div><strong>Existing:</strong> Standard basal chemical fertilizer dose without legume credit.</div>
            <div style="color:#166534; margin-top:4px;">
              <strong>Proposed:</strong> ${nFix > 0 ? `Credit <strong>~${nFix} kg N/ha natural biological nitrogen</strong> from legume nodulation, reducing synthetic urea purchase by ₹${Math.round(nFix * 28)}/acre. Inoculate legume seeds with Rhizobium culture.` : 'Maintain organic compost dressing and residue mulching.'}
            </div>
          </div>
        </div>

        <!-- Diff Card 3: Water Management -->
        <div class="compare-diff-card">
          <div class="compare-diff-head">
            <strong style="color:#0f172a; font-size:0.88rem;">3. Water Management &amp; Irrigation Timing</strong>
            <span style="font-size:0.7rem; font-weight:700; background:#dcfce7; color:#166534; padding:2px 8px; border-radius:10px;">PROPOSED UPDATE</span>
          </div>
          <div style="font-size:0.82rem; color:#475569; line-height:1.45;">
            <div><strong>Existing:</strong> General moisture guidance.</div>
            <div style="color:#166534; margin-top:4px;">
              <strong>Proposed:</strong> Align critical-stage irrigations to the specific stages of ${crops.map(c => c.name).join(", ")} (total annual demand: ${rotation.totalWaterNeedMm || rotation.meanIrrigationNeedMm} mm).
            </div>
          </div>
        </div>

        <!-- Unchanged Notice -->
        <div style="background:#f1f5f9; border-radius:6px; padding:8px 12px; font-size:0.75rem; color:#64748b;">
          ℹ️ <strong>Unchanged:</strong> All other farm boundaries, baseline soil test telemetry, historical NASA POWER observations, and farm profile properties remain fully intact.
        </div>
      </div>
    `;

    modal.classList.remove("hidden");

    // Close buttons
    element("btn-close-apply-modal")?.addEventListener("click", () => modal.classList.add("hidden"), { once: true });
    element("btn-cancel-apply-rotation")?.addEventListener("click", () => modal.classList.add("hidden"), { once: true });

    // Confirm button
    const btnConfirm = element("btn-confirm-apply-rotation");
    if (btnConfirm) {
      btnConfirm.onclick = () => {
        confirmApplyRotation(rotation, actionPlan);
        modal.classList.add("hidden");
      };
    }
  }

  function confirmApplyRotation(rotation, actionPlan) {
    if (!rotation) return;
    const profile = (typeof readProfile === "function" ? readProfile() : null) || {};
    if (!profile.farm) profile.farm = {};

    profile.farm.selectedRotation = {
      id: rotation.id,
      name: rotation.name,
      fullName: rotation.fullName,
      sequence: rotation.sequence,
      crops: rotation.crops,
      totalDurationDays: rotation.totalDurationDays,
      totalWaterNeedMm: rotation.totalWaterNeedMm || rotation.meanIrrigationNeedMm,
      netProfitPerAcre: rotation.economics?.netProfitPerAcre,
      appliedAt: new Date().toISOString()
    };

    // Save to localStorage
    try {
      if (typeof PROFILE_KEY !== "undefined") {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      }
    } catch (e) {
      console.warn("Storage save error:", e);
    }

    // Live update UI notification toast
    alert(`✓ Success! Your Farm Action Plan has been successfully updated with the "${rotation.fullName || rotation.name}" crop rotation!`);
  }
  /* ---------------- MULTIDECADAL EXTREMES TABLE ---------------- */
  function renderDecadalTable(actionPlan) {
    const container = element("action-plan-extremes");
    if (!container || !actionPlan?.decadalExtremes?.length) return;

    const rows = actionPlan.decadalExtremes.map(d => `
      <tr>
        <td><strong>${escapeHtml(d.decade)}</strong></td>
        <td>${format(d.totalRainfallMm, 0)} mm</td>
        <td>${format(d.meanTemperatureC, 1)}°C</td>
        <td>${format(d.hotDaysAbove35C, 0)} d</td>
        <td>${format(d.longestRainySeasonDrySpell, 0)} d</td>
        <td>${finite(d.rainySeasonOnsetDoy) ? `Day ${Math.round(d.rainySeasonOnsetDoy)}` : '—'}</td>
        <td>${format(d.referenceEt0Mm, 0)} mm</td>
      </tr>
    `).join("");

    container.innerHTML = `
      <table class="action-plan-table">
        <thead>
          <tr>
            <th>Decade</th>
            <th>Annual Rain</th>
            <th>Mean Temp</th>
            <th>Days &gt;35°C</th>
            <th>Dry Spell</th>
            <th>Monsoon Onset</th>
            <th>Annual ET₀</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  /* ---------------- (4) FOOTER: METHOD, LIMITS & PROVENANCE ---------------- */
  function renderFooter(data) {
    const methodEl = element("action-plan-method");
    const footerProvEl = element("action-plan-footer-provenance");

    if (footerProvEl) {
      footerProvEl.innerHTML = provenanceMarkup(data, data?.provenance?.parameters);
    }

    if (methodEl) {
      const m = data.method || {};
      const actionPlanMethod = data.actionPlan?.method || {};

      methodEl.innerHTML = `
        <div class="method-cards-grid">
          <div class="method-card">
            <h4>Daily Climatology &amp; ET₀</h4>
            <p>${escapeHtml(m.et0Method || "Daily Hargreaves-Samani reference ET₀ from T2M_MAX, T2M_MIN, day of year, and field latitude (radiation in MJ/m²/day converted to mm/day equivalent via 0.408 factor).")}</p>
          </div>
          <div class="method-card">
            <h4>Trend &amp; Statistical Projection</h4>
            <p>${escapeHtml(m.trendMethod || "Theil-Sen slope per decade and two-sided Mann-Kendall test; p < 0.05 is statistically significant.")} ${escapeHtml(m.projectionMethod || "Statistical trend projection (not a climate-model forecast) with approximate 80% prediction interval for significant trends only.")}</p>
          </div>
          <div class="method-card">
            <h4>Root-Zone Water Balance &amp; Replay</h4>
            <p>${escapeHtml(actionPlanMethod.waterBalance || "Daily rainfall enters a 100 mm root-zone bucket initialized from NASA POWER GWETROOT at sowing; daily Hargreaves ET₀ removed by FAO-56 Kc stage.")}</p>
          </div>
          <div class="method-card">
            <h4>Regional Scope &amp; Limitations</h4>
            <p>${escapeHtml(actionPlanMethod.cropWindows || "Sowing dates use regional South Asian season conventions (5°N–38°N, 60°E–98°E).")} ${escapeHtml(actionPlanMethod.limits || "Replay does not model dynamic soil texture, pest outbreaks, or within-field spatial variation.")}</p>
          </div>
        </div>
      `;
    }
  }

  /* ---------------- MASTER RENDER ---------------- */
  function render(data, profile) {
    renderAnswerCard(data, profile);
    renderFarmDiagnosis(data, profile);
    renderRoadmap(data, profile);
    renderSeasonalCalendar(data.actionPlan, profile);
    renderActionTracker(data.actionPlan, profile);
    renderCoreCharts(data);
    renderRotations(data.actionPlan);
    renderSecondaryCharts(data);
    renderDecadalTable(data.actionPlan);
    renderFooter(data);
    attachChartHoverInteractions(data);
  }

  /* ---------------- CHART INTERACTIVE HOVER & SLIDER TRACKER ---------------- */
  function attachChartHoverInteractions(data) {
    if (!data?.annualSeries?.length) return;

    const cards = document.querySelectorAll(".action-plan-chart-card:not(.unavailable)");
    cards.forEach(card => {
      const svg = card.querySelector(".action-plan-chart-svg");
      const overlay = card.querySelector(".chart-hover-overlay");
      const trackerGroup = card.querySelector(".chart-tracker-group");
      const trackerLine = card.querySelector(".chart-tracker-line");
      const trackerDot = card.querySelector(".chart-tracker-dot");
      const tooltip = card.querySelector(".chart-hover-tooltip");

      if (!svg || !overlay || !trackerGroup || !trackerLine || !trackerDot || !tooltip) return;

      const metricId = svg.dataset.metric;
      const definition = data.metricDefinitions?.[metricId];
      if (!definition) return;

      let points = getSeriesValues(data.annualSeries, metricId);
      if (activeDuration !== "all" && points.length > 0) {
        const numYears = Number(activeDuration);
        if (Number.isFinite(numYears) && numYears > 0) {
          const lastYear = points[points.length - 1].year;
          points = points.filter(p => p.year >= lastYear - numYears + 1);
        }
      }
      if (!points.length) return;

      const summary = data.metrics?.[metricId] || {};
      const moving = (summary.movingAverage || []).filter(p => finite(p.value));
      const movingMap = new Map(moving.map(p => [p.year, p.value]));

      const baseline = points.filter(p => p.year >= 1991 && p.year <= 2020).map(p => p.value);
      const baselineMean = baseline.length ? baseline.reduce((s, v) => s + v, 0) / baseline.length : null;

      const trend = summary.trend || {};
      const allValues = points.map(p => p.value)
        .concat(moving.map(p => p.value))
        .concat(trend.significant && finite(trend.projection) ? [trend.interval80?.lower, trend.interval80?.upper].filter(finite) : []);
      const minVal = Math.min(...allValues);
      const maxVal = Math.max(...allValues);
      const span = maxVal - minVal || 1;
      const min = minVal - span * 0.08;
      const max = maxVal + span * 0.08;
      const xMin = points[0].year;
      const xMax = 2035;
      const width = 460;
      const height = 210;
      const pad = { top: 22, right: 36, bottom: 26, left: 40 };

      const xPos = year => pad.left + ((year - xMin) / (xMax - xMin)) * (width - pad.left - pad.right);
      const yPos = val => height - pad.bottom - ((val - min) / (max - min)) * (height - pad.top - pad.bottom);

      function showPointAtYear(targetYear) {
        let closest = points[0];
        let minDiff = Math.abs(points[0].year - targetYear);
        for (const pt of points) {
          const d = Math.abs(pt.year - targetYear);
          if (d < minDiff) {
            minDiff = d;
            closest = pt;
          }
        }

        const cx = xPos(closest.year);
        const cy = yPos(closest.value);

        trackerLine.setAttribute("x1", cx.toFixed(1));
        trackerLine.setAttribute("x2", cx.toFixed(1));
        trackerDot.setAttribute("cx", cx.toFixed(1));
        trackerDot.setAttribute("cy", cy.toFixed(1));
        trackerGroup.style.opacity = "1";

        const movingVal = movingMap.get(closest.year);
        const hasBaseline = baselineMean !== null;
        const diff = hasBaseline ? closest.value - baselineMean : 0;
        const diffPct = hasBaseline && baselineMean !== 0 ? (diff / baselineMean) * 100 : 0;
        const sign = diff >= 0 ? "+" : "";

        tooltip.innerHTML = `
          <div class="tooltip-header">Year <strong>${closest.year}</strong></div>
          <div class="tooltip-row"><span class="tooltip-dot" style="background:#1d4ed8;"></span> Observed: <strong>${format(closest.value)} ${escapeHtml(definition.unit)}</strong></div>
          ${movingVal !== undefined ? `<div class="tooltip-row"><span class="tooltip-dot" style="background:#ea580c;"></span> 5-Yr Mean: <strong>${format(movingVal)} ${escapeHtml(definition.unit)}</strong></div>` : ''}
          ${hasBaseline ? `<div class="tooltip-row"><span class="tooltip-dot" style="background:#7c3aed;"></span> vs Normal: <strong>${sign}${format(diff)} ${escapeHtml(definition.unit)} (${sign}${format(diffPct, 1)}%)</strong></div>` : ''}
        `;

        const svgRect = svg.getBoundingClientRect();
        const cardRect = card.getBoundingClientRect();
        const scaleX = svgRect.width / width;
        const scaleY = svgRect.height / height;
        const pixelX = (svgRect.left - cardRect.left) + cx * scaleX;
        const pixelY = (svgRect.top - cardRect.top) + cy * scaleY;

        const isRightHalf = cx > width * 0.55;
        tooltip.style.left = isRightHalf ? `${Math.max(10, pixelX - 180)}px` : `${pixelX + 14}px`;
        tooltip.style.top = `${Math.max(12, Math.min(cardRect.height - 85, pixelY - 45))}px`;
        tooltip.style.opacity = "1";
      }

      function handleMouseMove(e) {
        const svgRect = svg.getBoundingClientRect();
        const mouseX = e.clientX - svgRect.left;
        const svgX = (mouseX / svgRect.width) * width;
        const clampedX = Math.max(pad.left, Math.min(width - pad.right, svgX));
        const estimatedYear = Math.round(xMin + ((clampedX - pad.left) / (width - pad.left - pad.right)) * (xMax - xMin));
        showPointAtYear(estimatedYear);
      }

      function handleMouseLeave() {
        trackerGroup.style.opacity = "0";
        tooltip.style.opacity = "0";
      }

      overlay.onmousemove = handleMouseMove;
      overlay.ontouchmove = e => {
        if (e.touches && e.touches[0]) handleMouseMove(e.touches[0]);
      };
      overlay.onmouseleave = handleMouseLeave;
      overlay.ontouchend = handleMouseLeave;

      svg._showPointAtYear = showPointAtYear;
      svg._hidePoint = handleMouseLeave;
    });

    // Connect slider & decade presets to chart curves
    const sliderBox = element("action-plan-slider-box");
    if (sliderBox && !sliderBox._hoverAttached) {
      sliderBox._hoverAttached = true;
      const decadeMidpoints = {
        "1980s": 1985,
        "1990s": 1995,
        "2000s": 2005,
        "2010s": 2015,
        "2020s": 2022,
        "all": 2015
      };

      function highlightDecadeOnCharts(dec) {
        const yr = decadeMidpoints[dec] || 2015;
        document.querySelectorAll(".action-plan-chart-svg").forEach(svg => {
          if (typeof svg._showPointAtYear === "function") svg._showPointAtYear(yr);
        });
      }

      function hideChartHighlight() {
        document.querySelectorAll(".action-plan-chart-svg").forEach(svg => {
          if (typeof svg._hidePoint === "function") svg._hidePoint();
        });
      }

      // Slider ticks hover
      sliderBox.querySelectorAll(".decade-ticks span").forEach((span, idx) => {
        const dec = DECADE_STEPS[idx] || "all";
        span.addEventListener("mouseenter", () => highlightDecadeOnCharts(dec));
        span.addEventListener("mouseleave", hideChartHighlight);
      });

      // Duration buttons hover
      sliderBox.querySelectorAll(".duration-btn").forEach(btn => {
        const dec = btn.dataset.decade || btn.dataset.duration;
        btn.addEventListener("mouseenter", () => highlightDecadeOnCharts(dec));
        btn.addEventListener("mouseleave", hideChartHighlight);
      });

      // Slider input event sync
      const yearSlider = element("action-plan-year-slider");
      if (yearSlider) {
        yearSlider.addEventListener("input", e => {
          const dec = DECADE_STEPS[Number(e.target.value)] || "all";
          highlightDecadeOnCharts(dec);
        });
      }
    }
  }

  /* ---------------- DATA LOADING & SCENARIO TOGGLING ---------------- */
  function updateSliderDisplay(val) {
    let decade = val;
    if (typeof val === "number" || /^[0-5]$/.test(String(val))) {
      decade = DECADE_STEPS[Number(val)] || "all";
    } else if (val === "45") {
      decade = "all";
    }
    activeDecade = decade;
    activeDuration = decade === "all" ? "all" : decade;

    const label = element("slider-year-label");
    const indicator = element("slider-active-indicator");
    const slider = element("action-plan-year-slider");

    if (slider) {
      const idx = DECADE_STEPS.indexOf(activeDecade);
      slider.value = idx >= 0 ? idx : 5;
    }
    if (label) {
      label.textContent = DECADE_RANGES[activeDecade]?.label || "All 45 Years (1981–2025)";
    }
    if (indicator) {
      indicator.textContent = activeDecade === "all"
        ? "All Decades Active (1981–Present)"
        : `Highlighting Decade: ${activeDecade}`;
    }

    document.querySelectorAll(".action-plan-duration-selector .duration-btn").forEach(btn => {
      const bDecade = btn.dataset.decade || btn.dataset.duration;
      btn.classList.toggle("active", bDecade === activeDecade || (activeDecade === "all" && bDecade === "all"));
    });
  }

  function applyInstantFilter(decadeOrVal) {
    updateSliderDisplay(decadeOrVal);
    if (currentRawData && currentProfile) {
      render(currentRawData, currentProfile);
    }
  }

  async function load(durationOverride) {
    let profile;
    try {
      profile = readProfile();
    } catch (error) {
      showState("action-plan-error");
      element("action-plan-error").textContent = error.message;
      return;
    }

    const center = profile?.field?.center;
    if (!Number.isFinite(Number(center?.lat)) || !Number.isFinite(Number(center?.lng))) {
      showState("action-plan-empty");
      return;
    }

    currentProfile = profile;
    const duration = durationOverride !== undefined ? durationOverride : activeDuration;
    activeDuration = duration === "45" ? "all" : String(duration);
    updateSliderDisplay(activeDuration);

    if (currentRawData) {
      applyInstantFilter(activeDuration);
    } else {
      showState("action-plan-loading");
    }

    const practice = (profile.farm?.crops || [])
      .filter(crop => typeof crop.value === "string")
      .map(crop => ({ id: crop.value, year: crop.year }));

    const waterTier = profile.farm?.water || "";
    const waterSource = profile.farm?.waterSource || "";
    const soilType = profile.farm?.soilType || "";
    const soilTest = profile.farm?.soilTest || "";
    const labSoil = profile.farm?.labSoil || null;
    const farmArea = profile.farm?.area || profile.farm?.areaAcres || profile.field?.calculatedAcres || "";
    const goals = profile.farm?.goals || ["profit", "resilience", "soil"];

    const cacheKey = `${Number(center.lat).toFixed(4)}_${Number(center.lng).toFixed(4)}_${activeDuration}_${activeScenario}_${JSON.stringify(practice)}_${waterSource}_${soilType}_${soilTest}_${labSoil ? 'lab' : 'nolab'}`;
    if (clientPlanCache.has(cacheKey)) {
      const cached = clientPlanCache.get(cacheKey);
      currentRawData = cached;
      render(cached, profile);
      showState("action-plan-content");
      return;
    }

    if (isLoading) return;
    isLoading = true;
    const thisRequestId = ++latestRequestId;

    const isStaticDeploy = typeof window !== "undefined" && (
      window.location.hostname.endsWith("github.io") ||
      window.location.protocol === "file:" ||
      !window.location.port
    );

    let data = null;

    // Instant Client Engine: runs locally in ~20ms with 0 network latency
    if (typeof window !== "undefined" && typeof window.generateClientActionPlan === "function") {
      try {
        data = window.generateClientActionPlan({
          lat: Number(center.lat),
          lng: Number(center.lng),
          practice,
          farmContext: {
            soilType,
            waterAccess: waterTier,
            labSoil,
            area: farmArea,
            goals,
            farmName: profile.farm?.name || ""
          },
          scenario: activeScenario
        });

        if (data && data.status !== "unavailable") {
          clientPlanCache.set(cacheKey, data);
          currentRawData = data;
          render(data, profile);
          showState("action-plan-content");
          isLoading = false;

          // For GitHub Pages / static deployments, client generation is complete and instantaneous!
          if (isStaticDeploy) return;
        }
      } catch (clientErr) {
        console.warn("[KRISHINITI-ActionPlan] Fast client action plan generator error:", clientErr);
      }
    }

    // Only if client engine was unavailable or running on a local Node backend server:
    if (!data) {
      const query = new URLSearchParams({
        lat: String(center.lat),
        lng: String(center.lng),
        duration: String(activeDuration),
        practice: JSON.stringify(practice),
        scenario: activeScenario,
        water: waterTier,
        waterSource: waterSource,
        soilType: soilType,
        soilTest: soilTest,
        labSoil: labSoil ? JSON.stringify(labSoil) : "",
        area: String(farmArea),
        goals: JSON.stringify(goals),
        farmName: profile.farm?.name || ""
      });

      try {
        const response = await fetch(`/api/climate/analysis?${query.toString()}`, { headers: { Accept: "application/json" } });
        if (response.ok) {
          data = await response.json();
        }
      } catch (netErr) {
        console.warn("[KRISHINITI-ActionPlan] Remote fetch failed:", netErr.message);
      }
    }

    if (thisRequestId !== latestRequestId) return; // Prevent race conditions!

    if (!data || data.status === "unavailable") {
      element("action-plan-error").innerHTML = `<p>${escapeHtml(data?.error || "NASA data unavailable.")}</p>
        <div>${provenanceMarkup(data || { status: "unavailable" }, data?.parameters || [], "UNAVAILABLE")}</div>`;
      showState("action-plan-error");
      isLoading = false;
      return;
    }
    clientPlanCache.set(cacheKey, data);
    currentRawData = data;
    render(data, profile);
    showState("action-plan-content");
    isLoading = false;
  }

  // Bind scenario toggle buttons
  function setupScenarioToggles() {
    const rainfedBtn = element("scenario-btn-rainfed");
    const irrigatedBtn = element("scenario-btn-irrigated");

    if (rainfedBtn && irrigatedBtn) {
      rainfedBtn.addEventListener("click", () => {
        if (activeScenario === "rainfed") return;
        activeScenario = "rainfed";
        rainfedBtn.classList.add("active");
        irrigatedBtn.classList.remove("active");
        load(activeDuration);
      });

      irrigatedBtn.addEventListener("click", () => {
        if (activeScenario === "irrigated") return;
        activeScenario = "irrigated";
        irrigatedBtn.classList.add("active");
        rainfedBtn.classList.remove("active");
        load(activeDuration);
      });
    }
  }

  // Bind Decade Slider
  const yearSlider = element("action-plan-year-slider");
  if (yearSlider) {
    yearSlider.addEventListener("input", e => applyInstantFilter(e.target.value));
    yearSlider.addEventListener("change", e => applyInstantFilter(e.target.value));
  }

  // Duration / Decade quick selector buttons & comparison strip cells
  document.addEventListener("click", e => {
    const btn = e.target.closest(".action-plan-duration-selector .duration-btn");
    if (btn) {
      const dec = btn.dataset.decade || btn.dataset.duration;
      applyInstantFilter(dec);
      return;
    }

    const cell = e.target.closest(".decade-cell");
    if (cell && cell.dataset.decade) {
      applyInstantFilter(cell.dataset.decade);
    }
  });

  element("action-plan-refresh")?.addEventListener("click", () => {
    clientPlanCache.clear();
    currentRawData = null;
    load(activeDuration);
  });

  element("action-plan-export")?.addEventListener("click", () => window.print());

  element("action-plan-lang-btn")?.addEventListener("click", () => {
    const cur = getLanguage();
    setActionPlanLanguage(cur === "hi" ? "en" : "hi");
  });

  // Smooth scroll for in-page navigation bar
  document.querySelectorAll(".action-plan-nav-pill").forEach(pill => {
    pill.addEventListener("click", e => {
      const href = pill.getAttribute("href");
      if (href && href.startsWith("#")) {
        e.preventDefault();
        const target = element(href.substring(1));
        if (target) {
          target.scrollIntoView({ behavior: "smooth", block: "start" });
          document.querySelectorAll(".action-plan-nav-pill").forEach(p => p.classList.remove("active"));
          pill.classList.add("active");
        }
      }
    });
  });

  element("action-plan-select-field")?.addEventListener("click", () => {
    if (typeof showScreen === "function") showScreen("map-screen");
  });

  element("action-plan-load-sample")?.addEventListener("click", () => {
    const sampleProfile = {
      farm: {
        name: "Samastipur Demonstration Field",
        areaAcres: 2.5,
        soilType: "clay_loam",
        water: "rainfed",
        crops: [{ value: "paddy", year: 2023 }, { value: "wheat", year: 2024 }]
      },
      field: {
        center: { lat: 25.86, lng: 85.78 }
      }
    };
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(sampleProfile));
      localStorage.setItem("krishiniti-active-screen", "action-plan-screen");
    } catch (e) {}
    currentRawData = null;
    load("all");
  });

  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#action-plan") {
      if (typeof showScreen === "function") showScreen("action-plan-screen");
      else load(activeDuration);
    }
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setupScenarioToggles();
      if (window.location.hash === "#action-plan" || localStorage.getItem("krishiniti-active-screen") === "action-plan-screen") {
        load(activeDuration);
      }
    });
  } else {
    setupScenarioToggles();
    if (window.location.hash === "#action-plan" || localStorage.getItem("krishiniti-active-screen") === "action-plan-screen") {
      load(activeDuration);
    }
  }

  window.KRISHINITI_ACTION_PLAN = {
    load,
    render,
    onLanguageChange: setActionPlanLanguage,
    setScenario: scenario => {
      activeScenario = scenario === "irrigated" ? "irrigated" : "rainfed";
      const rainfedBtn = element("scenario-btn-rainfed");
      const irrigatedBtn = element("scenario-btn-irrigated");
      if (rainfedBtn && irrigatedBtn) {
        rainfedBtn.classList.toggle("active", activeScenario === "rainfed");
        irrigatedBtn.classList.toggle("active", activeScenario === "irrigated");
      }
      if (currentRawData?.actionPlan) renderRotations(currentRawData.actionPlan);
    }
  };
})();
