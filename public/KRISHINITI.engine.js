/* ==========================================================================
   KRISHINITI DYNAMIC EVIDENCE-BASED CROP RECOMMENDATION & ROTATION ENGINE
   Sources: ICAR (https://icar.org.in/) & FAO (https://www.fao.org/4/s2022e/s2022e02.htm)
   ========================================================================== */

const KRISHINITI_CROP_DATABASE = [
  {
    id: "paddy",
    name: "Paddy (Rice – Kharif)",
    shortName: "Paddy",
    season: "Kharif (Monsoon)",
    sowingWindow: "June 15 – July 15",
    durationDays: [120, 140],
    waterRequirementMm: [450, 700],
    waterCategory: "High Water Demand",
    suitableSoils: ["alluvial", "clay", "loamy", "silty"],
    isLegume: false,
    sensitivities: "Sensitive to monsoon delays (>8 days dry spell at panicle initiation) and deep waterlogging at tillering.",
    sourceCitation: "ICAR Kharif Advisory & FAO CROPWAT"
  },
  {
    id: "wheat",
    name: "Wheat (Rabi Season)",
    shortName: "Wheat",
    season: "Rabi (Winter)",
    sowingWindow: "November 1 – December 15",
    durationDays: [110, 130],
    waterRequirementMm: [250, 350],
    waterCategory: "Moderate Water Demand",
    suitableSoils: ["alluvial", "loamy", "silty"],
    isLegume: false,
    sensitivities: "Sensitive to terminal heat stress (>30°C in grain filling/March) and lodging from unseasonal rain.",
    sourceCitation: "ICAR-IIWBR Karnal Guidelines"
  },
  {
    id: "maize",
    name: "Maize (Kharif / Rabi)",
    shortName: "Maize",
    season: "Kharif / Rabi",
    sowingWindow: "June–July (Kharif) or Oct 15–Nov 15 (Rabi)",
    durationDays: [95, 115],
    waterRequirementMm: [350, 500],
    waterCategory: "Moderate Water Demand",
    suitableSoils: ["loamy", "sandy", "alluvial", "silty"],
    isLegume: false,
    sensitivities: "Extremely sensitive to waterlogging at germination and early vegetative stages.",
    sourceCitation: "ICAR-IIMR Maize Advisory"
  },
  {
    id: "mustard",
    name: "Mustard / Rapeseed (Rabi)",
    shortName: "Mustard",
    season: "Rabi (Autumn/Winter)",
    sowingWindow: "October 10 – November 10",
    durationDays: [105, 120],
    waterRequirementMm: [150, 250],
    waterCategory: "Low Water Demand",
    suitableSoils: ["loamy", "sandy", "alluvial"],
    isLegume: false,
    sensitivities: "Susceptible to aphid proliferation under cloudy/humid winter weather; frost risk during flowering.",
    sourceCitation: "ICAR-DRMR Bharatpur"
  },
  {
    id: "lentils",
    name: "Lentils / Pulses (Rabi / Fallow)",
    shortName: "Lentils",
    season: "Rabi (Winter / Relay)",
    sowingWindow: "October 15 – November 25",
    durationDays: [110, 125],
    waterRequirementMm: [150, 200],
    waterCategory: "Low Water Demand",
    suitableSoils: ["alluvial", "loamy", "silty", "clay"],
    isLegume: true,
    sensitivities: "Intolerant of poorly drained waterlogged soils; susceptible to wilt and root rot under excessive moisture.",
    sourceCitation: "ICAR-IIPR Kanpur"
  },
  {
    id: "vegetables",
    name: "Vegetables / Potato (Rabi / Zaid)",
    shortName: "Vegetables",
    season: "Rabi / Zaid",
    sowingWindow: "October–November (Potato) or Feb–March (Zaid)",
    durationDays: [75, 95],
    waterRequirementMm: [300, 450],
    waterCategory: "Moderate-High Demand",
    suitableSoils: ["alluvial", "loamy", "sandy"],
    isLegume: false,
    sensitivities: "High sensitivity to late blight under high humidity; requires consistent, well-timed light irrigations.",
    sourceCitation: "ICAR-CPRI Shimla & Regional Horticulture"
  },
  {
    id: "sugarcane",
    name: "Sugarcane (Annual / Perennial)",
    shortName: "Sugarcane",
    season: "Annual (Spring/Autumn Planting)",
    sowingWindow: "February–March or October",
    durationDays: [300, 360],
    waterRequirementMm: [1200, 1800],
    waterCategory: "Very High Water Demand",
    suitableSoils: ["alluvial", "clay", "loamy"],
    isLegume: false,
    sensitivities: "Requires continuous moisture availability; high risk under drought without uninterrupted tube-well/canal access.",
    sourceCitation: "ICAR-IISR Lucknow Guidelines"
  }
];

function getCropInfo(idOrCode) {
  if (!idOrCode) return null;
  const key = String(idOrCode).toLowerCase();
  if (key === "paddy-wheat") return [getCropInfo("paddy"), getCropInfo("wheat")];
  if (key === "pulses") return getCropInfo("lentils");
  return KRISHINITI_CROP_DATABASE.find(c => c.id === key) || null;
}

function isCropMatch(loggedValue, targetCropId) {
  if (!loggedValue || !targetCropId) return false;
  const val = String(loggedValue).toLowerCase();
  const target = String(targetCropId).toLowerCase();
  if (target === "lentils" && (val.includes("pulse") || val.includes("lentil"))) return true;
  if (target === "paddy" && (val.includes("paddy") || val.includes("rice"))) return true;
  if (target === "wheat" && val.includes("wheat")) return true;
  if (target === "maize" && val.includes("maize")) return true;
  if (target === "mustard" && (val.includes("mustard") || val.includes("rapeseed"))) return true;
  if (target === "vegetables" && (val.includes("veg") || val.includes("potato"))) return true;
  if (target === "sugarcane" && val.includes("cane")) return true;
  return val.includes(target);
}

/**
 * Evaluates individual crop suitability against farmer profile and climate baseline.
 */
function evaluateCropSuitability(profile, climateData) {
  if (!profile || !profile.farm) {
    return { error: "Insufficient farm profile data to run recommendation engine." };
  }

  const farm = profile.farm;
  const waterAvailability = farm.water || "unknown";
  const soilType = farm.soilType || "unknown";
  const priority = farm.priority || "balanced";
  const pastCrops = farm.crops || [];
  const annualRainMm = climateData?.annualRainfallMm ?? 1100;

  const results = KRISHINITI_CROP_DATABASE.map(crop => {
    const checks = [];
    let passCount = 0;
    let conditionalCount = 0;
    let failCount = 0;

    // Water Check
    let waterPass = "pass";
    let waterReason = "";
    const minWater = crop.waterRequirementMm[0];
    const maxWater = crop.waterRequirementMm[1];

    if (crop.waterCategory.includes("High")) {
      if (waterAvailability === "high" || waterAvailability === "moderate") {
        waterPass = "pass";
        waterReason = `Reported water access (${waterAvailability}) supports seasonal demand (${minWater}–${maxWater} mm).`;
      } else if (waterAvailability === "rainfed" && annualRainMm >= 1000) {
        waterPass = "conditional";
        waterReason = `Viable on historical annual rainfall (${annualRainMm} mm), but vulnerable if monsoon dry spells exceed 8 days.`;
      } else if (waterAvailability === "unknown") {
        waterPass = "conditional";
        waterReason = `Water access was not specified; dedicated multi-stage irrigation (${minWater}–${maxWater} mm) must be verified before planting.`;
      } else {
        waterPass = "fail";
        waterReason = `Requires dedicated multi-stage irrigation; reported water tier (${waterAvailability}) is insufficient.`;
      }
    } else if (crop.waterCategory.includes("Moderate")) {
      if (waterAvailability !== "rainfed" && waterAvailability !== "unknown") {
        waterPass = "pass";
        waterReason = `Irrigation buffer (${waterAvailability}) can provide required critical stage waterings (${minWater}–${maxWater} mm).`;
      } else if (waterAvailability === "unknown") {
        waterPass = "conditional";
        waterReason = `Water access was not specified; supplemental irrigation (${minWater}–${maxWater} mm) recommended during dry spells.`;
      } else {
        waterPass = "conditional";
        waterReason = `Requires at least 2 supplemental irrigations to avoid severe yield loss under rainfed conditions.`;
      }
    } else {
      waterPass = "pass";
      waterReason = `Low water consumption (${minWater}–${maxWater} mm) matches rainfed or limited irrigation well.`;
    }

    if (waterPass === "pass") passCount++;
    else if (waterPass === "conditional") conditionalCount++;
    else failCount++;

    checks.push({
      checkName: "Water & Irrigation Availability",
      status: waterPass,
      explanation: waterReason
    });

    // Soil Check
    let soilPass = "pass";
    let soilReason = "";
    if (soilType === "unknown") {
      soilPass = "conditional";
      soilReason = "Soil type was not specified by farmer; regional alluvial baseline compatibility assumed.";
    } else if (crop.suitableSoils.includes(soilType)) {
      soilPass = "pass";
      soilReason = `Reported soil type (${soilType}) matches optimal agronomic suitability.`;
    } else {
      soilPass = "conditional";
      soilReason = `Reported soil (${soilType}) differs from primary preference (${crop.suitableSoils.join(", ")}); special bed management required.`;
    }

    if (soilPass === "pass") passCount++;
    else if (soilPass === "conditional") conditionalCount++;
    else failCount++;

    checks.push({
      checkName: "Soil Texture & Compatibility",
      status: soilPass,
      explanation: soilReason
    });

    // Rotation / Repetition check against past crops
    let rotationPass = "pass";
    let rotationReason = "";
    const matchesInHistory = pastCrops.filter(c => isCropMatch(c.value, crop.id)).length;
    if (matchesInHistory >= 2) {
      rotationPass = "conditional";
      rotationReason = `Continuous cultivation detected in your logged history (${matchesInHistory} previous seasons). Rotating with a non-host or legume crop is strongly advised.`;
    } else if (crop.isLegume) {
      rotationPass = "pass";
      rotationReason = "Legume biological nitrogen fixation breaks cereal pest cycles and improves soil structure.";
    } else {
      rotationPass = "pass";
      rotationReason = "Standard sequence fit for regional cropping systems.";
    }

    if (rotationPass === "pass") passCount++;
    else if (rotationPass === "conditional") conditionalCount++;
    else failCount++;

    checks.push({
      checkName: "Crop History & Rotation Fit",
      status: rotationPass,
      explanation: rotationReason
    });

    let suitability = "Highly Suitable";
    if (failCount > 0) {
      suitability = "Not Recommended (Constraints Present)";
    } else if (conditionalCount > 0 || waterPass === "conditional") {
      suitability = "Moderately Suitable (Conditional on Management)";
    }

    const missingInfo = [];
    if (soilType === "unknown") missingInfo.push("Laboratory soil test report (pH, organic carbon, N-P-K).");
    if (farm.soilTest !== "yes") missingInfo.push("Verified Soil Health Card.");
    missingInfo.push("Plot-scale drainage capacity during heavy monsoon rains.");

    const risks = [crop.sensitivities];
    if (crop.waterCategory.includes("High") && waterAvailability === "rainfed") {
      risks.push("Severe vulnerability to monsoon breaks during vegetative development.");
    }

    const nextSteps = [
      `Review ICAR sowing window guidance (${crop.sowingWindow}).`,
      `Verify irrigation source (${farm.waterSource || "tube-well/canal"}) release dates.`,
      `Conduct a certified soil test before applying synthetic N-P-K.`
    ];

    let soilConsiderations = "Neutral baseline maintenance with standard organic compost additions.";
    if (crop.isLegume) {
      soilConsiderations = "Captures atmospheric nitrogen biologically, contributing to improved soil fertility for subsequent crops.";
    } else if (matchesInHistory >= 2) {
      soilConsiderations = "Continuous cultivation increases soil compaction and targeted nutrient depletion.";
    }

    return {
      cropId: crop.id,
      cropName: crop.name,
      season: crop.season,
      sowingWindow: crop.sowingWindow,
      growingDuration: `${crop.durationDays[0]}–${crop.durationDays[1]} days`,
      waterDemandCategory: crop.waterCategory,
      soilConsiderations,
      suitability,
      checks,
      risks,
      missingInfo,
      nextSteps,
      sourceCitation: crop.sourceCitation
    };
  });

  return {
    evaluatedAt: new Date().toISOString(),
    recommendations: results
  };
}

/**
 * Dynamic Multi-Year Crop Rotation Stress Test Engine.
 * Evaluates sequences directly against the farmer's real logged history,
 * satellite rainfall baseline, and water availability.
 */
function evaluateCropRotation(climateData, sequences, profile) {
  const annualRainMm = climateData?.annualRainfallMm ?? 1100;
  const farm = profile?.farm || {};
  const waterTier = farm.water || "unknown";
  const soilType = farm.soilType || "alluvial";
  const pastLogged = farm.crops || [];

  return sequences.map(plan => {
    let totalWaterMin = 0;
    let totalWaterMax = 0;
    let totalDaysMin = 0;
    let totalDaysMax = 0;
    let legumeCount = 0;
    const resolvedCrops = [];
    const cropWindows = [];
    const risks = [];

    plan.sequence.forEach(cropId => {
      const match = getCropInfo(cropId);
      if (Array.isArray(match)) {
        match.forEach(m => { if (m) resolvedCrops.push(m); });
      } else if (match) {
        resolvedCrops.push(match);
      }
    });

    if (resolvedCrops.length === 0) {
      resolvedCrops.push(KRISHINITI_CROP_DATABASE[0]); // fallback to paddy
    }

    resolvedCrops.forEach(crop => {
      totalWaterMin += crop.waterRequirementMm[0];
      totalWaterMax += crop.waterRequirementMm[1];
      totalDaysMin += crop.durationDays[0];
      totalDaysMax += crop.durationDays[1];

      if (crop.isLegume) legumeCount++;
      cropWindows.push(`${crop.shortName} (${crop.sowingWindow})`);
      risks.push(`<strong>${crop.shortName}:</strong> ${crop.sensitivities}`);
    });

    // Detect continuous monoculture
    const isMonoculture = resolvedCrops.length >= 2 && resolvedCrops.every(c => c.id === resolvedCrops[0].id);
    const hasRepeatedNeighbors = resolvedCrops.some((c, idx) => idx > 0 && c.id === resolvedCrops[idx - 1].id);

    // Correlate with farmer's actual past logged history
    const pastIds = pastLogged.map(p => p.value).filter(Boolean);
    const matchesPastHistory = resolvedCrops.some(c =>
      pastIds.some(pastVal => isCropMatch(pastVal, c.id)) || pastIds.includes("paddy-wheat")
    );

    // Water Stress Evaluation against live NASA POWER rainfall
    let waterStatusClass = "badge-user";
    let waterFeasibility = "";
    const rainDelta = totalWaterMax - annualRainMm;

    if (totalWaterMax > annualRainMm && (waterTier === "rainfed" || waterTier === "low")) {
      waterStatusClass = "badge-error";
      waterFeasibility = `Severe Water Deficit: Sequence demand (${totalWaterMin}–${totalWaterMax} mm) exceeds regional historical rainfall (${annualRainMm} mm/yr) by ${rainDelta} mm. Tube-well or canal backup is mandatory to prevent crop failure.`;
    } else if (totalWaterMax > annualRainMm) {
      waterStatusClass = "badge-mixed";
      waterFeasibility = `Managed Deficit: Sequence demand (${totalWaterMin}–${totalWaterMax} mm) exceeds annual rain (${annualRainMm} mm), but reported irrigation (${waterTier}) can buffer the dry intervals.`;
    } else {
      waterStatusClass = "badge-user";
      waterFeasibility = `Safe Water Balance: Cumulative demand (${totalWaterMin}–${totalWaterMax} mm) is well within the historical annual rainfall baseline (${annualRainMm} mm/yr).`;
    }

    // Agronomic Rotation Compatibility
    let rotationCompatibility = "Diversified & Climate-Resilient";
    let compatibilityStatus = "badge-user";

    if (isMonoculture) {
      rotationCompatibility = `Critical Risk (${resolvedCrops.length}-Year Monoculture)`;
      compatibilityStatus = "badge-error";
    } else if (hasRepeatedNeighbors) {
      rotationCompatibility = "Moderate Risk (Back-to-Back Same Crop)";
      compatibilityStatus = "badge-mixed";
    }

    // Documented Soil Health Trajectory
    let soilHealth = "";
    if (isMonoculture) {
      soilHealth = `<strong>Severe Monoculture Penalty:</strong> Growing ${resolvedCrops[0].shortName} repeatedly on the same field depletes identical soil horizons (${soilType} soil), increases subsoil compaction, and fosters persistent pest and fungal reservoirs.`;
    } else if (legumeCount > 0) {
      soilHealth = `<strong>Biological Nitrogen Restoration:</strong> Including pulse/legume cycles leverages Rhizobium symbiosis to fix atmospheric nitrogen into the soil, reducing chemical urea demand for the subsequent season and disrupting cereal pest lifecycles.`;
    } else {
      soilHealth = `<strong>Balanced Root Stratification:</strong> Alternating cereal and oilseed crops engages multiple soil depths to maintain soil pore structure. Baseline organic matter should be replenished with compost/FYM.`;
    }

    const unknowns = [
      farm.soilTest === "yes" ? "Farmer holds verified Soil Health Card." : "Laboratory chemical parameters unverified (Soil Health Card required for exact N-P-K & organic carbon values).",
      "NASA POWER provides regional historical climate observations, not physical field-level soil nutrient measurements.",
      `Duration (${totalDaysMin}–${totalDaysMax} days total): Ensure sufficient turnaround buffer between harvest and subsequent sowing.`
    ];

    return {
      planName: plan.name,
      planDescription: plan.description,
      sequenceNames: resolvedCrops.map(c => c.shortName).join(" ➔ "),
      seasonalWaterDemand: `${totalWaterMin}–${totalWaterMax} mm (vs. ${annualRainMm} mm NASA Rain)`,
      waterFeasibility,
      waterStatusClass,
      growingDuration: `${totalDaysMin}–${totalDaysMax} days cumulative`,
      plantingWindows: cropWindows.join(" | "),
      rotationCompatibility,
      compatibilityStatus,
      soilHealth,
      climateRisks: risks,
      unknowns,
      basedOnPastData: matchesPastHistory
    };
  });
}
/* ==========================================================================
   KRISHINITI WEATHER-RISK & CROP-PROTECTION EVALUATION ENGINE
   Sources:
   - Open-Meteo Forecast API (https://open-meteo.com/en/docs)
   - IMD Agromet Advisory Service (https://mausam.imd.gov.in/responsive/servicesMetAgriculture.php)
   - ICAR Contingent Crop Planning Guidelines
   ========================================================================== */

const KRISHINITI_GROWTH_STAGES = [
  {
    id: "unspecified",
    en: "Stage not specified (General crop guidance)",
    hi: "अवस्था निर्दिष्ट नहीं (सामान्य फसल मार्गदर्शन)"
  },
  {
    id: "sowing",
    en: "Sowing / Germination / Emergence",
    hi: "बुवाई / अंकुरण / शुरुआती अवस्था"
  },
  {
    id: "vegetative",
    en: "Vegetative Growth / Tillering / Branching",
    hi: "वानस्पतिक वृद्धि / कल्ले निकलना"
  },
  {
    id: "flowering",
    en: "Flowering / Panicle Initiation / Tasseling",
    hi: "फूल आना / बाली बनना (प्रजनन अवस्था)"
  },
  {
    id: "grain_filling",
    en: "Grain Filling / Pod & Tuber Development",
    hi: "दाना भरना / फली और कंद विकास"
  },
  {
    id: "harvest",
    en: "Maturity / Harvesting & Post-Harvest Drying",
    hi: "पकने की अवस्था / कटाई और सुखाना"
  }
];

const CROP_STAGE_VULNERABILITY_MATRIX = {
  paddy: {
    nameEn: "Paddy (Rice)",
    nameHi: "धान (चावल)",
    heavy_rain: {
      sowing: {
        en: "Heavy rain immediately after nursery sowing or direct seeding can wash away seeds or submerge young seedlings.",
        hi: "नर्सरी या सीधी बुवाई के तुरंत बाद भारी बारिश से बीज बह सकते हैं या छोटे पौधे डूब सकते हैं।",
        precautionsEn: [
          "Postpone nursery sowing or direct seeding until the heavy rain spell passes.",
          "Open drainage cuts in nursery beds so standing water does not submerge tender plumules."
        ],
        precautionsHi: [
          "भारी बारिश का दौर गुजरने तक नर्सरी या सीधी बुवाई स्थगित करें।",
          "नर्सरी क्यारियों से अतिरिक्त पानी निकालने की व्यवस्था करें।"
        ]
      },
      flowering: {
        en: "Intense rain during panicle emergence and anthesis can wash away pollen and increase chaffy (unfilled) grains.",
        hi: "बाली निकलने और फूल आने के समय तेज बारिश से परागकण धुल सकते हैं और दाने खाली रह सकते हैं।",
        precautionsEn: [
          "Maintain shallow water level (2–5 cm) and drain excess rainwater from field bunds.",
          "Avoid top-dressing urea or spraying foliar chemicals ahead of forecasted downpours."
        ],
        precautionsHi: [
          "खेत में पानी का स्तर 2–5 सेमी रखें और अतिरिक्त बरसाती पानी बाहर निकालें।",
          "बारिश के पूर्वानुमान से पहले यूरिया या कीटनाशक का छिड़काव न करें।"
        ]
      },
      harvest: {
        en: "Unseasonal or heavy rain at maturity causes panicle lodging, grain discolouration, and vivipary (sprouting on panicle).",
        hi: "पकने या कटाई के समय बारिश से फसल गिर सकती है और बाली में दाने अंकुरित या बदरंग हो सकते हैं।",
        precautionsEn: [
          "Prioritize harvesting physiologically mature plots immediately and shift bundles to covered threshing floors.",
          "Drain standing water completely from mature plots to prevent panicle soaking."
        ],
        precautionsHi: [
          "पकी हुई फसल की तुरंत कटाई करें और गट्ठरों को सुरक्षित व ढके हुए स्थान पर रखें।",
          "पके हुए खेतों से जमा पानी तुरंत बाहर निकालें।"
        ]
      }
    },
    heat_stress: {
      flowering: {
        en: "Daytime temperatures above 35°C–37°C during flowering can induce spikelet sterility and reduce pollination success.",
        hi: "फूल आने के दौरान 35°C–37°C से अधिक तापमान परागण को प्रभावित कर सकता है और दानों को खाली रख सकता है।",
        precautionsEn: [
          "Maintain a 5 cm standing water layer in the field to buffer canopy microclimate temperature.",
          "Irrigate during early morning or evening hours rather than midday."
        ],
        precautionsHi: [
          "खेत के तापमान को नियंत्रित रखने के लिए 5 सेमी पानी बनाए रखें।",
          "सिंचाई दोपहर के बजाय सुबह जल्दी या शाम को करें।"
        ]
      }
    },
    strong_wind: {
      harvest: {
        en: "Gusty winds above 30 km/h can cause stem lodging in tall or heavy-panicled paddy varieties.",
        hi: "30 किमी/घंटा से तेज हवाओं के कारण धान की पकी या लंबी फसल गिर (लॉजिंग) सकती है।",
        precautionsEn: [
          "Avoid heavy irrigation during high wind alerts, as soft wet soil reduces root anchorage.",
          "Tie lodged clumps loosely in small upright bundles after wind subsides to prevent grain rot."
        ],
        precautionsHi: [
          "तेज हवा के पूर्वानुमान के दौरान भारी सिंचाई न करें क्योंकि गीली मिट्टी में जड़ें ढीली हो जाती हैं।",
          "हवा रुकने के बाद गिरी हुई फसल को छोटे समूहों में बांधकर खड़ा करें।"
        ]
      }
    }
  },
  wheat: {
    nameEn: "Wheat",
    nameHi: "गेहूँ",
    heavy_rain: {
      sowing: {
        en: "Heavy rain right after sowing causes surface crusting in alluvial/loamy soils, impeding coleoptile emergence.",
        hi: "बुवाई के तुरंत बाद भारी बारिश से मिट्टी की ऊपरी परत सख्त हो सकती है, जिससे अंकुरण बाधित होता है।",
        precautionsEn: [
          "Delay sowing if heavy rain is forecasted within 48 hours.",
          "Ensure field channels are clear to prevent water stagnation in freshly sown beds."
        ],
        precautionsHi: [
          "यदि अगले 48 घंटों में भारी बारिश की संभावना हो तो बुवाई रोक दें।",
          "ताजा बोए गए खेतों में जलभराव रोकने के लिए नालियां साफ रखें।"
        ]
      },
      harvest: {
        en: "Unseasonal rain at maturity reduces grain lustre and delays mechanical harvesting.",
        hi: "पकने के समय बेमौसम बारिश से दानों की चमक कम हो सकती है और कटाई में देरी होती है।",
        precautionsEn: [
          "Cover harvested wheat sheaves with tarpaulin sheets and elevate stacked bags off damp ground.",
          "Ensure grain moisture is dried below 12% before storage."
        ],
        precautionsHi: [
          "कटी हुई फसल को तिरपाल से ढकें और बोरियों को नमी वाली जमीन से ऊपर रखें।",
          "भंडारण से पहले दानों में नमी 12% से कम सुनिश्चित करें।"
        ]
      }
    },
    heat_stress: {
      grain_filling: {
        en: "Terminal heat (>32°C–35°C) during milk and dough stages accelerates senescence and shrinks grain weight.",
        hi: "दाना भरने (दुग्धावस्था) के समय 32°C–35°C से अधिक तापमान दानों को सिकोड़ सकता है।",
        precautionsEn: [
          "Apply light supplemental irrigation during calm evening hours to cool the root zone.",
          "Consult local KVK advisories on foliar potassium nitrate (KNO3) sprays if terminal heat persists."
        ],
        precautionsHi: [
          "जड़ क्षेत्र को ठंडा रखने के लिए शांत शाम के समय हल्की सिंचाई करें।",
          "लगातार अधिक तापमान रहने पर स्थानीय कृषि विज्ञान केंद्र (KVK) की सलाह लें।"
        ]
      }
    },
    strong_wind: {
      grain_filling: {
        en: "Strong winds combined with wet soil cause lodging during ear-head filling, restricting nutrient translocation.",
        hi: "बाली में दाना भरते समय तेज हवा और गीली मिट्टी से गेहूँ की फसल गिर सकती है।",
        precautionsEn: [
          "Strictly withhold irrigation when wind speeds above 30 km/h are forecasted.",
          "Irrigate only during calm morning or evening intervals."
        ],
        precautionsHi: [
          "30 किमी/घंटा से तेज हवा का पूर्वानुमान होने पर सिंचाई बिल्कुल न करें।",
          "केवल शांत हवा की स्थिति में ही हल्की सिंचाई करें।"
        ]
      }
    }
  },
  maize: {
    nameEn: "Maize",
    nameHi: "मक्का",
    heavy_rain: {
      sowing: {
        en: "Maize is highly intolerant of waterlogging during germination and knee-high stages; >24 hours of stagnation causes root anoxia.",
        hi: "अंकुरण और शुरुआती अवस्था में मक्का जलभराव के प्रति अत्यंत संवेदनशील है; 24 घंटे से अधिक पानी रुकने पर जड़ें सड़ सकती हैं।",
        precautionsEn: [
          "Adopt ridge-and-furrow planting and clear furrow outlets before forecasted rain.",
          "Drain excess rainwater immediately so root crowns remain aerated."
        ],
        precautionsHi: [
          "मेड़ और नाली विधि अपनाएं तथा बारिश से पहले जल निकासी के रास्ते साफ करें।",
          "खेत में अतिरिक्त पानी बिल्कुल न रुकने दें।"
        ]
      }
    },
    strong_wind: {
      flowering: {
        en: "High wind gusts during tasseling and silking can cause stalk lodging or desiccate silks.",
        hi: "मंजरी और सिल्क निकलने के समय तेज हवा से मक्के के तने झुक या टूट सकते हैं।",
        precautionsEn: [
          "Perform earthing-up around stalk bases at knee-high stage to strengthen brace root anchorage.",
          "Avoid flood irrigation during windy days."
        ],
        precautionsHi: [
          "जड़ों को मजबूती देने के लिए पौधों के पास मिट्टी चढ़ाएं (अर्थिंग-अप)।",
          "तेज हवा वाले दिनों में सिंचाई करने से बचें।"
        ]
      }
    }
  },
  mustard: {
    nameEn: "Mustard / Rapeseed",
    nameHi: "सरसों / राई",
    humid_cloudy: {
      flowering: {
        en: "High relative humidity (>80%) with mild temperatures favours mustard aphid (Lipaphis erysimi) and Alternaria blight.",
        hi: "फूल और फली बनते समय अधिक आर्द्रता (>80%) से माहू (एफिड) कीट और झुलसा रोग का खतरा बढ़ जाता है।",
        precautionsEn: [
          "Inspect terminal shoots across 10–12 random plants for early aphid colonies.",
          "Install yellow sticky traps and avoid excessive nitrogen top-dressing."
        ],
        precautionsHi: [
          "खेत में 10–12 स्थानों पर पौधों के ऊपरी हिस्सों में माहू कीट की नियमित निगरानी करें।",
          "पीले चिपचिपे ट्रैप लगाएं और यूरिया के अत्यधिक प्रयोग से बचें।"
        ]
      }
    },
    cold_spell: {
      flowering: {
        en: "Chilly nights below 6°C during flowering and siliqua formation can cause flower drop or seed shrivelling.",
        hi: "फूल और फली बनते समय रात का तापमान 6°C से नीचे जाने पर पाला या फूल झड़ने का जोखिम रहता है।",
        precautionsEn: [
          "Apply light irrigation in the evening when cold night temperatures are forecasted to buffer soil heat.",
          "Maintain weed-free bunds to improve cold air drainage."
        ],
        precautionsHi: [
          "अधिक ठंड या पाले की संभावना होने पर शाम के समय हल्की सिंचाई करें।",
          "ठंडी हवा के प्रवाह को रोकने के लिए खेत की मेड़ों को साफ रखें।"
        ]
      }
    }
  },
  lentils: {
    nameEn: "Lentils / Pulses",
    nameHi: "मसूर / दलहन",
    heavy_rain: {
      vegetative: {
        en: "Pulses are highly sensitive to soil saturation; poor drainage triggers Fusarium wilt and collar rot.",
        hi: "दलहनी फसलें जलभराव के प्रति बहुत संवेदनशील होती हैं; पानी रुकने से उकठा (विल्ट) और जड़ सड़न का खतरा बढ़ता है।",
        precautionsEn: [
          "Open shallow surface drains immediately to evacuate rainwater from low-lying patches.",
          "Do not apply irrigation when rainfall probability exceeds 60%."
        ],
        precautionsHi: [
          "निचले हिस्सों से बरसाती पानी तुरंत निकालने के लिए हल्की नालियां बनाएं।",
          "बारिश की संभावना 60% से अधिक होने पर सिंचाई न करें।"
        ]
      }
    }
  },
  vegetables: {
    nameEn: "Vegetables / Potato",
    nameHi: "सब्जियाँ / आलू",
    humid_cloudy: {
      vegetative: {
        en: "Persistent high humidity (>80%) and cool/mild temperatures create conducive conditions for late blight (Phytophthora infestans) in potato and tomato.",
        hi: "लगातार अधिक नमी (>80%) और बदली रहने पर आलू व टमाटर में पछेती झुलसा (लेट ब्लाइट) रोग की आशंका रहती है।",
        precautionsEn: [
          "Monitor lower leaves for water-soaked dark lesions during humid mornings.",
          "Maintain proper ridge earthing-up so potato tubers are not exposed to spores washed down from foliage."
        ],
        precautionsHi: [
          "सुबह के समय निचली पत्तियों पर काले या भूरे धब्बों की जांच करें।",
          "आलू की मेड़ों पर मिट्टी ठीक से चढ़ाएं ताकि कंद खुले न रहें।"
        ]
      }
    },
    heavy_rain: {
      sowing: {
        en: "Heavy rainfall in vegetable beds causes tuber/seed rot and soil compaction around ridges.",
        hi: "सब्जी की क्यारियों में भारी बारिश से बीज या कंद सड़ सकते हैं और मेड़ें क्षतिग्रस्त हो सकती हैं।",
        precautionsEn: [
          "Clear cross-drains at the ends of raised beds or ridges before rain starts.",
          "Avoid irrigation and fertilizer application during wet forecast windows."
        ],
        precautionsHi: [
          "बारिश से पहले उठी हुई क्यारियों और मेड़ों के सिरों पर जल निकासी साफ करें।",
          "बारिश के पूर्वानुमान के दौरान सिंचाई और खाद देने से बचें।"
        ]
      }
    }
  },
  sugarcane: {
    nameEn: "Sugarcane",
    nameHi: "गन्ना",
    strong_wind: {
      vegetative: {
        en: "High wind speeds combined with rain can lodge tall cane stalks, reducing sucrose accumulation.",
        hi: "तेज हवा और बारिश के साथ गन्ने की लंबी फसल गिर सकती है, जिससे चीनी की मात्रा घटती है।",
        precautionsEn: [
          "Practice propping and trash-twist tying of cane clumps across adjacent rows.",
          "Withhold irrigation prior to forecasted strong wind events."
        ],
        precautionsHi: [
          "गन्ने को गिरने से बचाने के लिए सूखी पत्तियों से बंधाई (प्रॉपिंग) करें।",
          "तेज हवा के पूर्वानुमान से पहले सिंचाई न करें।"
        ]
      }
    }
  }
};

function getSpecificCropStageGuidance(cropId, stageId, riskType, lang = "en") {
  const isHi = lang === "hi";
  const cropEntry = CROP_STAGE_VULNERABILITY_MATRIX[cropId];
  const stageObj = KRISHINITI_GROWTH_STAGES.find(s => s.id === stageId) || KRISHINITI_GROWTH_STAGES[0];
  const stageLabel = isHi ? stageObj.hi : stageObj.en;

  if (!cropEntry) {
    return {
      cropLabel: isHi ? "सामान्य फसल" : "General Farm Crops",
      stageLabel,
      hasSpecificMatch: false,
      impactText: isHi
        ? "विशिष्ट फसल और विकास अवस्था चुनने पर अधिक सटीक संवेदनशीलता दिखाई जाएगी।"
        : "Select your specific standing crop and growth stage above to view targeted phenological sensitivity.",
      precautions: getGenericPrecautionsForRisk(riskType, lang)
    };
  }

  const cropLabel = isHi ? cropEntry.nameHi : cropEntry.nameEn;
  const riskGroup = cropEntry[riskType];

  if (riskGroup && stageId !== "unspecified" && riskGroup[stageId]) {
    const match = riskGroup[stageId];
    return {
      cropLabel,
      stageLabel,
      hasSpecificMatch: true,
      impactText: isHi ? match.hi : match.en,
      precautions: isHi ? match.precautionsHi : match.precautionsEn
    };
  }

  if (riskGroup) {
    const fallbackStageKey = Object.keys(riskGroup)[0];
    const fallbackMatch = riskGroup[fallbackStageKey];
    const prefix = stageId === "unspecified"
      ? (isHi ? "अवस्था निर्दिष्ट नहीं है — सामान्य फसल संवेदनशीलता: " : "Growth stage not specified — general crop sensitivity: ")
      : (isHi ? `${stageLabel} के लिए सामान्य सावधानी: ` : `General guidance during ${stageLabel}: `);
    return {
      cropLabel,
      stageLabel,
      hasSpecificMatch: false,
      impactText: prefix + (isHi ? fallbackMatch.hi : fallbackMatch.en),
      precautions: isHi ? fallbackMatch.precautionsHi : fallbackMatch.precautionsEn
    };
  }

  return {
    cropLabel,
    stageLabel,
    hasSpecificMatch: false,
    impactText: isHi
      ? `${cropLabel} (${stageLabel}) के लिए इस मौसम स्थिति में सामान्य खेत प्रबंधन अपनाएं।`
      : `For ${cropLabel} (${stageLabel}), follow standard field drainage and microclimate precautions under this forecast condition.`,
    precautions: getGenericPrecautionsForRisk(riskType, lang)
  };
}

function getGenericPrecautionsForRisk(riskType, lang = "en") {
  const isHi = lang === "hi";
  const genericMap = {
    heavy_rain: {
      en: [
        "Inspect and clear field bund outlets and drainage channels to prevent water stagnation.",
        "Postpone fertilizer top-dressing, pesticide spraying, and sowing until heavy rain subsides.",
        "Keep harvested produce covered and elevated on dry platforms."
      ],
      hi: [
        "जलभराव रोकने के लिए खेत की मेड़ों और जल निकासी नालियों को साफ रखें।",
        "भारी बारिश थमने तक खाद, कीटनाशक छिड़काव और नई बुवाई स्थगित रखें।",
        "कटी हुई उपज को सूखे और ऊंचे स्थान पर तिरपाल से ढक कर रखें।"
      ]
    },
    heat_stress: {
      en: [
        "Apply light irrigation during early morning or evening hours to reduce canopy heat stress.",
        "Avoid foliar sprays during peak afternoon temperatures (>35°C).",
        "Use crop residue mulching where feasible to conserve root-zone soil moisture."
      ],
      hi: [
        "तापमान के प्रभाव को कम करने के लिए सुबह जल्दी या शाम के समय हल्की सिंचाई करें।",
        "दोपहर की तेज धूप (>35°C) में किसी भी रसायन का छिड़काव न करें।",
        "मिट्टी की नमी बचाने के लिए पलवार (मल्चिंग) का उपयोग करें।"
      ]
    },
    strong_wind: {
      en: [
        "Withhold flood irrigation prior to forecasted strong winds so wet soil does not loosen root anchorage.",
        "Do not conduct pesticide or herbicide spraying during windy conditions to prevent spray drift.",
        "Provide mechanical support or earthing-up to tall crops."
      ],
      hi: [
        "तेज हवा के पूर्वानुमान से पहले सिंचाई न करें, क्योंकि गीली मिट्टी में पौधे आसानी से गिर सकते हैं।",
        "हवा चलने के दौरान कीटनाशक या खरपतवारनाशक का छिड़काव न करें।",
        "लंबी फसलों के तनों को सहारा दें या मिट्टी चढ़ाएं।"
      ]
    },
    cold_spell: {
      en: [
        "Apply light evening irrigation to maintain warmer night-time soil radiation around roots.",
        "Protect young vegetable nurseries with low poly-tunnels or thatch covers overnight."
      ],
      hi: [
        "रात के समय मिट्टी का तापमान बनाए रखने के लिए शाम को हल्की सिंचाई करें।",
        "छोटी सब्जी नर्सरी को रात में प्लास्टिक या पुआल से ढकें।"
      ]
    },
    humid_cloudy: {
      en: [
        "Scout lower plant canopies regularly for early signs of fungal blight, mildew, or sucking pests.",
        "Avoid excess nitrogen application and dense canopy crowding that traps humidity."
      ],
      hi: [
        "अधिक नमी के दौरान निचली पत्तियों में फफूंद रोग या रस चूसक कीटों की नियमित जांच करें।",
        "यूरिया के अत्यधिक उपयोग से बचें और खेत में हवा का संचार बनाए रखें।"
      ]
    }
  };

  return (genericMap[riskType] || genericMap.heavy_rain)[isHi ? "hi" : "en"];
}

/**
 * Evaluates 7-day Open-Meteo forecast days and optional verified IMD bulletin
 * to produce transparent, non-alarmist risk cards.
 */
function evaluateWeatherRisksAndProtection(forecastState, options = {}) {
  const lang = options.lang === "hi" ? "hi" : "en";
  const isHi = lang === "hi";
  const selectedCropId = options.cropId || "paddy";
  const selectedStageId = options.stageId || "unspecified";
  const officialImdOverride = options.officialImd || null;

  if (!forecastState || forecastState.status === "loading" || forecastState.status === "idle") {
    return { status: "loading" };
  }

  if (forecastState.status === "error" || !Array.isArray(forecastState.days) || forecastState.days.length === 0) {
    return {
      status: "unavailable",
      reason: forecastState?.errorMessage || (isHi
        ? "Open-Meteo पूर्वानुमान डेटा उपलब्ध नहीं है।"
        : "Open-Meteo forecast data is currently unavailable.")
    };
  }

  const days = forecastState.days;
  const risks = [];

  // 1. Official IMD Warning Card (ONLY if explicitly logged/verified by user from IMD bulletin)
  if (officialImdOverride && officialImdOverride.level && officialImdOverride.level !== "none") {
    const levelLabels = {
      yellow: isHi ? "IMD पीला अलर्ट (सतर्क रहें / Watch)" : "IMD Yellow Alert (Be Updated / Watch)",
      orange: isHi ? "IMD नारंगी अलर्ट (तैयार रहें / Alert)" : "IMD Orange Alert (Be Prepared / Alert)",
      red: isHi ? "IMD लाल चेतावनी (तुरंत कदम उठाएं / Warning)" : "IMD Red Warning (Take Action)"
    };
    const hazardType = officialImdOverride.hazard || "heavy_rain";
    const stageInfo = getSpecificCropStageGuidance(selectedCropId, selectedStageId, hazardType, lang);

    risks.push({
      id: "official_imd_alert",
      isOfficialWarning: true,
      severity: officialImdOverride.level === "red" || officialImdOverride.level === "orange" ? "high" : "moderate",
      badgeText: isHi ? "आधिकारिक IMD चेतावनी (सत्यापित बुलेटिन)" : "OFFICIAL IMD WARNING (BULLETIN VERIFIED)",
      severityLabel: levelLabels[officialImdOverride.level] || levelLabels.yellow,
      title: isHi
        ? `भारत मौसम विज्ञान विभाग (IMD) जिला चेतावनी: ${levelLabels[officialImdOverride.level]}`
        : `India Meteorological Department (IMD) District Alert: ${levelLabels[officialImdOverride.level]}`,
      metricSummary: officialImdOverride.notes
        ? officialImdOverride.notes
        : (isHi ? "किसान/उपयोगकर्ता द्वारा आधिकारिक IMD जिला बुलेटिन से दर्ज।" : "Logged from official IMD District Agromet / Met Subdivision bulletin."),
      validWindow: forecastState.dateRange,
      sourceName: "India Meteorological Department (mausam.imd.gov.in)",
      cropImpact: stageInfo.impactText,
      cropLabel: stageInfo.cropLabel,
      stageLabel: stageInfo.stageLabel,
      precautions: stageInfo.precautions
    });
  }

  // 2. Heavy Rainfall / Waterlogging Risk (IMD threshold: >= 64.5 mm/day is Heavy Rain; >= 25 mm/day is Moderate Agronomic Wet Spell)
  const heavyRainDays = days.filter(d => d.precipSum !== null && d.precipSum >= 25);
  const cumulative3DayRain = days.slice(0, 3).reduce((acc, d) => acc + (d.precipSum || 0), 0);

  if (heavyRainDays.length > 0 || cumulative3DayRain >= 50) {
    const maxRainDay = days.reduce((best, cur) => ((cur.precipSum || 0) > (best.precipSum || 0) ? cur : best), days[0]);
    const isHeavy = (maxRainDay.precipSum || 0) >= 64.5 || cumulative3DayRain >= 85;
    const affectedDates = heavyRainDays.length > 0
      ? heavyRainDays.map(d => d.date).join(", ")
      : `${days[0].date} – ${days[Math.min(2, days.length - 1)].date}`;

    const stageInfo = getSpecificCropStageGuidance(selectedCropId, selectedStageId, "heavy_rain", lang);

    risks.push({
      id: "estimated_heavy_rain",
      isOfficialWarning: false,
      severity: isHeavy ? "high" : "moderate",
      badgeText: isHi ? "अनुमानित मॉडल जोखिम (आधिकारिक चेतावनी नहीं)" : "ESTIMATED MODEL RISK (NOT AN OFFICIAL WARNING)",
      severityLabel: isHeavy
        ? (isHi ? "उच्च वर्षा जोखिम (≥64.5 मिमी या संचयी जलभराव)" : "High Rainfall Risk (≥64.5 mm/day or cumulative surge)")
        : (isHi ? "मध्यम वर्षा / नमी जोखिम (≥25 मिमी/दिन)" : "Moderate Rainfall / Wet-Spell Risk (≥25 mm/day)"),
      title: isHi ? "भारी बारिश और खेत में जल निकासी का जोखिम" : "Heavy Rainfall & Field Drainage Risk",
      metricSummary: isHi
        ? `अधिकतम दैनिक वर्षा: ${maxRainDay.precipSum} मिमी (${maxRainDay.date}, संभावना ${maxRainDay.precipProb ?? "—"}%) · 3-दिवसीय कुल: ${cumulative3DayRain.toFixed(1)} मिमी`
        : `Peak daily forecast: ${maxRainDay.precipSum} mm on ${maxRainDay.date} (Prob: ${maxRainDay.precipProb ?? "—"}%) · 3-day cumulative: ${cumulative3DayRain.toFixed(1)} mm`,
      validWindow: affectedDates,
      sourceName: "Open-Meteo Numerical Weather Prediction + ICAR/IMD Agromet Rules",
      cropImpact: stageInfo.impactText,
      cropLabel: stageInfo.cropLabel,
      stageLabel: stageInfo.stageLabel,
      precautions: stageInfo.precautions
    });
  }

  // 3. Excessive Heat / Terminal Heat Risk (Max temp >= 36°C, or >= 33°C if Wheat is in Flowering/Grain Filling)
  const isWheatReproductive = selectedCropId === "wheat" && (selectedStageId === "flowering" || selectedStageId === "grain_filling");
  const heatThreshold = isWheatReproductive ? 32.5 : 36.0;
  const hotDays = days.filter(d => d.tempMax !== null && d.tempMax >= heatThreshold);

  if (hotDays.length > 0) {
    const peakHotDay = hotDays.reduce((best, cur) => ((cur.tempMax || 0) > (best.tempMax || 0) ? cur : best), hotDays[0]);
    const isSevereHeat = (peakHotDay.tempMax || 0) >= 40.0;
    const stageInfo = getSpecificCropStageGuidance(selectedCropId, selectedStageId, "heat_stress", lang);

    risks.push({
      id: "estimated_heat_stress",
      isOfficialWarning: false,
      severity: isSevereHeat ? "high" : "moderate",
      badgeText: isHi ? "अनुमानित मॉडल जोखिम (आधिकारिक चेतावनी नहीं)" : "ESTIMATED MODEL RISK (NOT AN OFFICIAL WARNING)",
      severityLabel: isSevereHeat
        ? (isHi ? "तीव्र ताप तनाव (≥40°C)" : "High Thermal Stress (≥40°C)")
        : (isHi ? "मध्यम ताप / वाष्पोत्सर्जन तनाव" : "Moderate Heat / Evapotranspiration Stress"),
      title: isHi ? "अधिक तापमान और नमी की कमी का जोखिम" : "Excessive Heat & Canopy Moisture Stress",
      metricSummary: isHi
        ? `अधिकतम पूर्वानुमानित तापमान: ${peakHotDay.tempMax}°C (${peakHotDay.date}) · ${hotDays.length} दिन ≥${heatThreshold}°C`
        : `Peak forecast max temperature: ${peakHotDay.tempMax}°C on ${peakHotDay.date} · ${hotDays.length} day(s) ≥${heatThreshold}°C`,
      validWindow: hotDays.map(d => d.date).join(", "),
      sourceName: "Open-Meteo 2m Air Temperature Model + ICAR Crop Thresholds",
      cropImpact: stageInfo.impactText,
      cropLabel: stageInfo.cropLabel,
      stageLabel: stageInfo.stageLabel,
      precautions: stageInfo.precautions
    });
  }

  // 4. Strong Winds / Lodging & Spray-Drift Risk (Max wind >= 30 km/h)
  const windyDays = days.filter(d => d.windMax !== null && d.windMax >= 30);
  if (windyDays.length > 0) {
    const peakWindDay = windyDays.reduce((best, cur) => ((cur.windMax || 0) > (best.windMax || 0) ? cur : best), windyDays[0]);
    const isHighWind = (peakWindDay.windMax || 0) >= 42;
    const stageInfo = getSpecificCropStageGuidance(selectedCropId, selectedStageId, "strong_wind", lang);

    risks.push({
      id: "estimated_strong_wind",
      isOfficialWarning: false,
      severity: isHighWind ? "high" : "moderate",
      badgeText: isHi ? "अनुमानित मॉडल जोखिम (आधिकारिक चेतावनी नहीं)" : "ESTIMATED MODEL RISK (NOT AN OFFICIAL WARNING)",
      severityLabel: isHighWind
        ? (isHi ? "तेज आंधी / फसल गिरने का जोखिम (≥42 किमी/घंटा)" : "High Wind / Lodging Risk (≥42 km/h)")
        : (isHi ? "मध्यम तेज हवा (≥30 किमी/घंटा)" : "Moderate Gusty Wind (≥30 km/h)"),
      title: isHi ? "तेज हवा और फसल गिरने (लॉजिंग) का जोखिम" : "Strong Surface Winds & Crop Lodging Risk",
      metricSummary: isHi
        ? `अधिकतम हवा की गति: ${peakWindDay.windMax} किमी/घंटा (${peakWindDay.date})`
        : `Peak 10m wind speed forecast: ${peakWindDay.windMax} km/h on ${peakWindDay.date}`,
      validWindow: windyDays.map(d => d.date).join(", "),
      sourceName: "Open-Meteo 10m Wind Forecast + ICAR Agronomic Precautions",
      cropImpact: stageInfo.impactText,
      cropLabel: stageInfo.cropLabel,
      stageLabel: stageInfo.stageLabel,
      precautions: stageInfo.precautions
    });
  }

  // 5. Cold / Chilly Night Risk (Min temp <= 6°C)
  const coldDays = days.filter(d => d.tempMin !== null && d.tempMin <= 6.0);
  if (coldDays.length > 0) {
    const coldestDay = coldDays.reduce((best, cur) => ((cur.tempMin ?? 99) < (best.tempMin ?? 99) ? cur : best), coldDays[0]);
    const isFrostRisk = (coldestDay.tempMin ?? 10) <= 4.0;
    const stageInfo = getSpecificCropStageGuidance(selectedCropId, selectedStageId, "cold_spell", lang);

    risks.push({
      id: "estimated_cold_spell",
      isOfficialWarning: false,
      severity: isFrostRisk ? "high" : "moderate",
      badgeText: isHi ? "अनुमानित मॉडल जोखिम (आधिकारिक चेतावनी नहीं)" : "ESTIMATED MODEL RISK (NOT AN OFFICIAL WARNING)",
      severityLabel: isFrostRisk
        ? (isHi ? "शीतलहर / पाला जोखिम (≤4°C)" : "Chilly Night / Frost Risk (≤4°C)")
        : (isHi ? "कम रात्रि तापमान (≤6°C)" : "Low Night Temperature (≤6°C)"),
      title: isHi ? "कम रात्रि तापमान और शीत तनाव" : "Low Night Temperature & Cold Stress",
      metricSummary: isHi
        ? `न्यूनतम रात्रि तापमान: ${coldestDay.tempMin}°C (${coldestDay.date})`
        : `Lowest forecast night temperature: ${coldestDay.tempMin}°C on ${coldestDay.date}`,
      validWindow: coldDays.map(d => d.date).join(", "),
      sourceName: "Open-Meteo Minimum Temperature Model + ICAR Rabi Guidelines",
      cropImpact: stageInfo.impactText,
      cropLabel: stageInfo.cropLabel,
      stageLabel: stageInfo.stageLabel,
      precautions: stageInfo.precautions
    });
  }

  // 6. Persistent High Humidity (>82% mean RH for >=3 days) relevant for Mustard/Vegetables/Pulses
  const humidDays = days.filter(d => d.humidityMean !== null && d.humidityMean >= 82);
  if (humidDays.length >= 3 && ["mustard", "vegetables", "lentils", "paddy"].includes(selectedCropId)) {
    const maxRhDay = humidDays.reduce((best, cur) => ((cur.humidityMean || 0) > (best.humidityMean || 0) ? cur : best), humidDays[0]);
    const stageInfo = getSpecificCropStageGuidance(selectedCropId, selectedStageId, "humid_cloudy", lang);

    risks.push({
      id: "estimated_humid_spell",
      isOfficialWarning: false,
      severity: "moderate",
      badgeText: isHi ? "अनुमानित मॉडल जोखिम (आधिकारिक चेतावनी नहीं)" : "ESTIMATED MODEL RISK (NOT AN OFFICIAL WARNING)",
      severityLabel: isHi ? "उच्च सापेक्ष आर्द्रता (≥82%)" : "Persistent High Humidity (≥82% RH)",
      title: isHi ? "अधिक नमी और कीट/रोग निगरानी" : "High Canopy Humidity & Pest/Blight Watch",
      metricSummary: isHi
        ? `${humidDays.length} दिनों तक औसत आर्द्रता ≥82% (शिखर: ${maxRhDay.humidityMean}% को ${maxRhDay.date})`
        : `${humidDays.length} forecast days with mean relative humidity ≥82% (Peak: ${maxRhDay.humidityMean}% on ${maxRhDay.date})`,
      validWindow: humidDays.map(d => d.date).join(", "),
      sourceName: "Open-Meteo 2m Relative Humidity + ICAR Pest Surveillance Rules",
      cropImpact: stageInfo.impactText,
      cropLabel: stageInfo.cropLabel,
      stageLabel: stageInfo.stageLabel,
      precautions: stageInfo.precautions
    });
  }

  const validFetchedIso = forecastState.fetchedAt && !isNaN(new Date(forecastState.fetchedAt).getTime())
    ? new Date(forecastState.fetchedAt).toISOString()
    : new Date().toISOString();

  return {
    status: "ready",
    evaluatedAtIso: new Date().toISOString(),
    forecastIssuedAt: forecastState.current?.time || validFetchedIso,
    forecastFetchedAt: forecastState.fetchedAt || Date.now(),
    forecastWindow: forecastState.dateRange || "Upcoming 7-Day Window",
    timezone: forecastState.timezone || "Asia/Kolkata",
    coordinates: forecastState.coordinatesUsed || {
      lat: 0,
      lng: 0,
      requestedLat: 0,
      requestedLng: 0
    },
    risks
  };
}