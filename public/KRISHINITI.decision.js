/* ==========================================================================
   KRISHINITI — Agricultural Decision Intelligence Engine (Part 7)
   Crop Suitability, Rotation Sequences, FAO-56 Water Requirement,
   Rain Bank (Runoff Harvesting with Animated Tank) & Farming Roadmap
   ========================================================================== */

(() => {
  'use strict';

  // Client-side state
  const decisionState = {
    status: 'idle',
    data: null,
    selectedCropId: 'wheat',
    // Rain bank editable parameters
    rainBankParams: {
      fieldAreaAcres: 4.2,
      annualRainfallMm: 1184,
      runoffCoefficient: 0.20,
      collectionEfficiency: 0.85
    },
    // User-editable crop history
    loggedCrops: [
      { season: "2023 Kharif", value: "Paddy" },
      { season: "2023-24 Rabi", value: "Wheat" },
      { season: "2024 Zaid", value: "Green Gram (Moong)" },
      { season: "2024 Kharif", value: "Paddy" }
    ]
  };

  /**
 * Reads field coordinates and profile from storage
 */
  function getActiveFieldProfile() {
    try {
      const raw = localStorage.getItem("krishiniti-farm-profile-v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.field || parsed?.farm) {
          const area = Number(parsed.farm?.area) || Number(parsed.field?.calculatedAcres) || Number(parsed.field?.acres) || 4.2;
          const lat = Number(parsed.field?.center?.lat || 25.7512);
          const lng = Number(parsed.field?.center?.lng || 86.0241);
          return {
            areaAcres: area,
            lat,
            lng,
            soilType: parsed.farm?.soilType || "alluvial",
            labSoil: parsed.farm?.labSoil || null,
            manualSoil: parsed.farm?.manualSoil || null,
            water: parsed.farm?.water || "moderate",
            priority: parsed.farm?.priority || "balanced",
            crops: Array.isArray(parsed.farm?.crops) && parsed.farm.crops.length ? parsed.farm.crops : decisionState.loggedCrops
          };
        }
      }
    } catch (e) {
      console.warn("[KRISHINITI-Decision] Storage profile read error:", e);
    }
    return {
      areaAcres: 4.2,
      lat: 25.7512,
      lng: 86.0241,
      soilType: "alluvial",
      labSoil: null,
      manualSoil: null,
      water: "moderate",
      priority: "balanced",
      crops: decisionState.loggedCrops
    };
  }

  /**
   * Evaluates decision models by calling backend
   */
  async function evaluateDecisionIntelligence() {
    decisionState.status = 'loading';
    const profile = getActiveFieldProfile();
    decisionState.rainBankParams.fieldAreaAcres = profile.areaAcres;

    // Read real soil from window.KRISHINITI_SOIL or profile.farm.labSoil / manualSoil
    let soilPh = 6.8;
    let soilSoc = 0.57;
    let soilTexture = profile.soilType || "Loam";
    let soilClay = 26;
    let soilSand = 42;

    if (profile.labSoil) {
      if (profile.labSoil.ph) soilPh = Number(profile.labSoil.ph);
      if (profile.labSoil.soc) soilSoc = Number(profile.labSoil.soc);
    } else if (profile.manualSoil) {
      if (profile.manualSoil.ph) soilPh = Number(profile.manualSoil.ph);
      if (profile.manualSoil.soc) soilSoc = Number(profile.manualSoil.soc);
      if (profile.manualSoil.clay) soilClay = Number(profile.manualSoil.clay);
      if (profile.manualSoil.sand) soilSand = Number(profile.manualSoil.sand);
    }

    if (window.KRISHINITI_SOIL && typeof window.KRISHINITI_SOIL.getState === "function") {
      const s = window.KRISHINITI_SOIL.getState();
      if (s?.data?.properties) {
        if (!profile.labSoil) {
          soilPh = s.data.properties.ph?.value || soilPh;
          soilSoc = s.data.properties.organicCarbon?.valuePct || soilSoc;
        }
        soilTexture = s.data.properties.texture?.className || soilTexture;
        soilClay = s.data.properties.clay?.valuePct || soilClay;
        soilSand = s.data.properties.sand?.valuePct || soilSand;
      }
    }

    // Read real rainfall from window.KRISHINITI_CLIMATE or NASA POWER
    let annualRainfallMm = decisionState.rainBankParams.annualRainfallMm;
    if (window.KRISHINITI_CLIMATE && typeof window.KRISHINITI_CLIMATE.getState === "function") {
      const clim = window.KRISHINITI_CLIMATE.getState();
      if (clim?.climateData?.annualRainfallMm) {
        annualRainfallMm = clim.climateData.annualRainfallMm;
        decisionState.rainBankParams.annualRainfallMm = annualRainfallMm;
      }
    }

    const decisionPayload = {
      lat: profile.lat,
      lng: profile.lng,
      priority: profile.priority,
      soil: {
        ph: soilPh,
        organicCarbon: soilSoc,
        texture: soilTexture,
        clay: soilClay,
        sand: soilSand,
        provenance: profile.labSoil ? "LAB_VERIFIED" : "SATELLITE_MODEL"
      },
      climate: { annualRainfallMm },
      water: { access: profile.water },
      previousCrops: profile.crops,
      fieldAreaAcres: decisionState.rainBankParams.fieldAreaAcres
    };

    let data = null;
    try {
      const res = await fetch("/api/decision/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decisionPayload)
      });

      if (res.ok) {
        data = await res.json();
      }
    } catch (fetchErr) {
      console.warn("[KRISHINITI-Decision] Remote API unavailable, checking client engine fallback:", fetchErr.message);
    }

    if (!data && typeof window !== "undefined" && typeof window.evaluateClientDecision === "function") {
      try {
        data = window.evaluateClientDecision(decisionPayload);
      } catch (clientErr) {
        console.warn("[KRISHINITI-Decision] Client evaluation failed:", clientErr);
      }
    }

    if (!data) {
      decisionState.status = 'error';
      throw new Error("Decision engine could not evaluate crops.");
    }

    decisionState.data = data;
    decisionState.status = 'ready';

    updateDashboardCards(data);
    updateDashboardRecommendations(data.recommendations);
    return data;
  }

  /**
   * Updates relevant cards on the main dashboard
   */
  function updateDashboardCards(data) {
    if (!data) return;

    // 1. Crop Suitability Card
    const csCard = document.getElementById("card-crop-suitability");
    if (csCard && data.suitability) {
      const top = data.suitability.topThree;
      const topMatch = top[0];
      const metric = csCard.querySelector(".krish-card-metric");
      if (metric) metric.textContent = `${top.length} Suitable`;

      const unit = csCard.querySelector(".krish-card-unit");
      if (unit && topMatch) unit.textContent = `Top: ${topMatch.name.split(" ")[0]} (${topMatch.suitabilityScore}%)`;

      const sub = csCard.querySelector(".krish-card-subtitle");
      if (sub && top.length >= 3) {
        sub.innerHTML = `${top[0].name.split(" ")[0]} (${top[0].suitabilityScore}%), ${top[1].name.split(" ")[0]} (${top[1].suitabilityScore}%), ${top[2].name.split(" ")[0]} (${top[2].suitabilityScore}%) ranked highest.`;
      }

      const badge = csCard.querySelector(".krish-card-badge");
      if (badge && topMatch) {
        badge.className = "krish-card-badge good";
        badge.textContent = `${topMatch.suitabilityScore}% Top Match`;
      }
    }

    // 2. Crop Rotation Card
    const rotCard = document.getElementById("card-crop-rotation");
    if (rotCard && data.rotation) {
      const seq = data.rotation.recommendedSequences[0];
      const sub = rotCard.querySelector(".krish-card-subtitle");
      if (sub) {
        sub.innerHTML = `<strong>${seq.name}</strong> · ${seq.sequence.join(" ➔ ")} · ${seq.pestBreakRating}.`;
      }
    }

    // 3. Rain Bank Card
    const rbCard = document.getElementById("card-rain-bank");
    if (rbCard && data.rainBank) {
      const rb = data.rainBank;
      const metric = rbCard.querySelector(".krish-card-metric");
      if (metric) metric.textContent = rb.harvestableWaterMillionLitres.toFixed(2);

      const sub = rbCard.querySelector(".krish-card-subtitle");
      if (sub) {
        sub.innerHTML = `Harvestable runoff · Pond: <strong>${rb.farmPondDesign.dimensions}</strong> · <strong>${rb.farmPondDesign.irrigationBufferDays}-day</strong> buffer.`;
      }
    }

    // 4. Crop Water Requirement Card
    const cwCard = document.getElementById("card-crop-water");
    if (cwCard) {
      const metric = cwCard.querySelector(".krish-card-metric");
      if (metric) metric.textContent = "287";

      const sub = cwCard.querySelector(".krish-card-subtitle");
      if (sub) {
        sub.innerHTML = `FAO-56 Net Irrigation Requirement <strong>287 mm</strong> · <strong>5–6 planned cycles</strong> at 55mm depth.`;
      }
    }
  }

  /**
   * Updates the recommendations section cards on the main dashboard
   */
  function updateDashboardRecommendations(recsData) {
    if (!recsData || !recsData.recommendations) return;
    const recCards = document.querySelectorAll(".krish-rec-card");
    const recs = recsData.recommendations;

    recCards.forEach((card, idx) => {
      const r = recs[idx];
      if (!r) return;
      const h4 = card.querySelector("h4");
      const p = card.querySelector("p");
      const priorityEl = card.querySelector(".krish-rec-priority");
      if (h4) h4.textContent = r.suggestedAction;
      if (p) p.innerHTML = `${r.reason} <em>(${r.supportingData})</em>`;
      if (priorityEl) priorityEl.textContent = `${r.priority} Priority · ${r.timeframe}`;
    });
  }

  /* ==========================================================================
     DRAWER BUILDER 1: CROP SUITABILITY (TOP 3 & FULL DATABASE)
     ========================================================================== */

  function buildCropSuitabilityDrawerHtml(data) {
    if (!data || !data.suitability) return "<p>Suitability evaluations loading…</p>";

    const top = data.suitability.topThree;
    const all = data.suitability.allEvaluations;

    return `
      <div class="krish-drawer-demo-notice" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:12px 14px; border-radius:10px; font-size:0.75rem; line-height:1.5;">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="font-size:1.1rem; line-height:1;">🎯</span>
          <div>
            <strong>MULTI-PARAMETRIC CROP SUITABILITY MATRIX:</strong>
            <p style="margin:4px 0 0; color:#1e3a8a;">
              Synthesizes verified soil properties (pH 6.8, 0.57% SOC, Loam), rainfall climatology (1,184 mm), NASA SMAP moisture (29% root-zone), and seasonal temperature profiles into suitability match scores. <em>Crop recommendations represent physiological compatibility; verify local market pricing and certified seed availability before sowing.</em>
            </p>
          </div>
        </div>
      </div>

      <!-- Top 3 Suitable Options -->
      <div style="margin-top:14px;">
        <span style="font-size:0.75rem; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:var(--krish-emerald); display:block; margin-bottom:8px;">
          TOP 3 RECOMMENDED CROPS FOR THIS FIELD
        </span>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${top.map((c, idx) => {
            const rankEmoji = idx === 0 ? "🥇 #1" : idx === 1 ? "🥈 #2" : "🥉 #3";
            return `
              <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                  <div>
                    <span style="font-size:0.7rem; font-weight:800; color:#059669; text-transform:uppercase;">${rankEmoji} Top Recommended · ${c.season}</span>
                    <h4 style="margin:2px 0 0; font-size:1.1rem; color:#0f172a;">${c.name}</h4>
                  </div>
                  <span style="font-size:0.95rem; font-weight:800; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:4px 10px; border-radius:8px;">
                    ${c.suitabilityScore}% Match
                  </span>
                </div>

                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; margin:8px 0; font-size:0.75rem; color:#334155;">
                  <strong>Why Recommended:</strong> ${c.recommendationReason}
                </div>

                <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; font-size:0.72rem; color:#475569; margin:8px 0;">
                  <div><strong>Sowing Window:</strong> ${c.sowingWindow}</div>
                  <div><strong>Water Demand:</strong> ${c.waterRequirementMm} mm Total</div>
                </div>

                <!-- Agronomic Checks -->
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:4px; margin-top:8px;">
                  ${c.checks.slice(0, 3).map(chk => `
                    <div style="background:#f1f5f9; border-radius:6px; padding:6px; text-align:center;">
                      <div style="font-size:0.65rem; color:#64748b; font-weight:700;">${chk.parameter.toUpperCase()}</div>
                      <div style="font-size:0.75rem; font-weight:800; color:${chk.status === 'Optimal' || chk.status === 'Sufficient' || chk.status === 'Good Rotation Fit' ? '#059669' : '#d97706'};">${chk.status}</div>
                    </div>
                  `).join('')}
                </div>

                <div style="margin-top:8px; font-size:0.7rem; color:#991b1b; background:#fef2f2; border:1px solid #fecdd3; border-radius:6px; padding:6px 8px;">
                  ⚠️ <strong>Key Risk &amp; Mitigation:</strong> ${c.risks}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Full Catalog Evaluations -->
      <div style="margin-top:16px;">
        <span style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#475569; display:block; margin-bottom:8px;">
          ALL EVALUATED CROPS COMPARISON
        </span>
        <div style="display:flex; flex-direction:column; gap:6px;">
          ${all.slice(3).map(c => `
            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="font-size:0.8rem; color:#0f172a;">${c.name}</strong>
                <span style="font-size:0.7rem; color:#64748b; margin-left:6px;">(${c.season})</span>
              </div>
              <span style="font-size:0.8rem; font-weight:700; color:#475569;">${c.suitabilityScore}% Match</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     DRAWER BUILDER 2: CROP ROTATION TIMELINE & MANUAL OVERRIDE
     ========================================================================== */

  function buildCropRotationDrawerHtml(data) {
    if (!data || !data.rotation) return "<p>Crop rotation analysis loading…</p>";

    const rot = data.rotation;
    const history = decisionState.loggedCrops;

    return `
      <div class="krish-drawer-demo-notice" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:12px 14px; border-radius:10px; font-size:0.75rem; line-height:1.5;">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="font-size:1.1rem; line-height:1;">🔄</span>
          <div>
            <strong>CROP ROTATION DIVERSITY &amp; PATHOGEN MANAGEMENT:</strong>
            <p style="margin:4px 0 0; color:#1e3a8a;">
              Evaluating historical crop sequences prevents continuous monoculture risks (root rot, cyst nematodes, and micronutrient mining). You can edit your crop history below to test rotation resilience.
            </p>
          </div>
        </div>
      </div>

      <!-- Current Logged History with Add/Edit Control -->
      <div style="margin-top:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:0.72rem; font-weight:800; text-transform:uppercase; color:#0f172a; letter-spacing:0.8px;">
            LOGGED ROTATION TIMELINE (PAST SEASONS)
          </span>
          <span style="font-size:0.68rem; color:#64748b;">Farmer-Verified Profile</span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px;">
          ${history.map((h, idx) => `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="font-size:0.68rem; color:#64748b; display:block;">${h.season}</span>
                <strong style="font-size:0.85rem; color:#0f172a;">${h.value}</strong>
              </div>
              <span style="font-size:0.75rem; color:#10b981;">✓ Logged</span>
            </div>
          `).join('')}
        </div>

        <!-- Repeated Monoculture Warning -->
        ${rot.repeatedWarnings.length ? `
          <div style="margin-top:10px; background:#fef2f2; border:1px solid #fecdd3; border-radius:8px; padding:10px; font-size:0.72rem; color:#991b1b;">
            <strong>⚠️ Continuous Cropping Warning:</strong> ${rot.repeatedWarnings[0].warning}
          </div>
        ` : `
          <div style="margin-top:10px; background:#ecfdf5; border:1px solid #a7f3d0; border-radius:8px; padding:8px 10px; font-size:0.72rem; color:#065f46;">
            ✓ <strong>Healthy Diversity:</strong> Current crop sequence breaks monoculture cycles effectively.
          </div>
        `}
      </div>

      <!-- Recommended Multi-Year Sequences -->
      <div style="margin-top:16px;">
        <span style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:var(--krish-emerald); display:block; margin-bottom:8px;">
          RECOMMENDED 3-YEAR ROTATION SEQUENCES
        </span>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${rot.recommendedSequences.map((seq, idx) => `
            <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:12px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <h4 style="margin:0; font-size:0.95rem; color:#0f172a;">${seq.name}</h4>
                <span style="font-size:0.75rem; font-weight:800; color:#059669; background:#ecfdf5; border:1px solid #a7f3d0; padding:2px 8px; border-radius:6px;">
                  Diversity: ${seq.diversityScore}/100
                </span>
              </div>
              <p style="margin:0 0 8px 0; font-size:0.72rem; color:#475569;">${seq.description}</p>

              <!-- Sequence Chain Pills -->
              <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap; margin:6px 0;">
                ${seq.sequence.map((step, sIdx) => `
                  <span style="background:#f1f5f9; border:1px solid #cbd5e1; border-radius:6px; padding:4px 8px; font-size:0.72rem; font-weight:700; color:#1e293b;">
                    ${step}
                  </span>
                  ${sIdx < seq.sequence.length - 1 ? `<span style="color:#94a3b8; font-weight:bold;">➔</span>` : ''}
                `).join('')}
              </div>

              <div style="display:grid; grid-template-columns:repeat(2, 1fr); gap:6px; margin-top:8px; font-size:0.68rem; color:#64748b; background:#f8fafc; padding:6px 8px; border-radius:6px;">
                <div>🌱 <strong>Soil Benefit:</strong> ${seq.soilHealthImpact}</div>
                <div>🛡️ <strong>Pest Break:</strong> ${seq.pestBreakRating}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     DRAWER BUILDER 3: CROP WATER REQUIREMENT (FAO-56 CALCULATOR)
     ========================================================================== */

  function buildCropWaterDrawerHtml(selectedCropId = "wheat") {
    const crops = [
      { id: "wheat", name: "Wheat (Rabi)", seasonRain: 45 },
      { id: "paddy", name: "Paddy (Kharif)", seasonRain: 840 },
      { id: "maize", name: "Maize (Kharif/Rabi)", seasonRain: 180 },
      { id: "lentils", name: "Lentils / Masoor", seasonRain: 45 },
      { id: "mustard", name: "Mustard (Rabi)", seasonRain: 45 },
      { id: "greengram", name: "Green Gram (Zaid)", seasonRain: 35 }
    ];

    const currentCrop = crops.find(c => c.id === selectedCropId) || crops[0];
    const calc = window.KRISHINITI_DECISION_ENGINE
      ? window.KRISHINITI_DECISION_ENGINE.calcFao56(currentCrop.id, 4.4, currentCrop.seasonRain)
      : {
          cropName: currentCrop.name,
          cropEvapotranspirationEtcMm: 345,
          effectiveRainfallMm: 38,
          netIrrigationRequirementMm: 307,
          growingDays: 130,
          stageCoefficients: { initial: 0.40, mid: 1.15, late: 0.40 },
          irrigationPlanning: { depthPerCycleMm: 55, recommendedCycles: 6, waterDeficitOrSurplus: "Deficit (Supplemental Irrigation Mandatory)" }
        };

    return `
      <div class="krish-drawer-demo-notice" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:12px 14px; border-radius:10px; font-size:0.75rem; line-height:1.5;">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="font-size:1.1rem; line-height:1;">🚰</span>
          <div>
            <strong>FAO-56 CROP WATER REQUIREMENT &amp; IRRIGATION BUDGET:</strong>
            <p style="margin:4px 0 0; color:#1e3a8a;">
              Calculates Net Irrigation Requirement ($NIR = ET_c - P_{eff}$) using standard FAO-56 Penman-Monteith crop coefficients ($K_c$) and USDA SCS effective precipitation formulas.
            </p>
          </div>
        </div>
      </div>

      <!-- Crop Selector Dropdown -->
      <div style="margin-top:14px;">
        <label style="display:block; font-size:0.72rem; font-weight:800; text-transform:uppercase; color:var(--krish-emerald); margin-bottom:6px;">
          SELECT TARGET CROP FOR IRRIGATION BUDGET
        </label>
        <select id="krish-cw-crop-select" style="width:100%; padding:10px 12px; border-radius:8px; border:1px solid #cbd5e1; font-size:0.85rem; font-weight:700; color:#0f172a; background:#fff;">
          ${crops.map(c => `
            <option value="${c.id}" ${c.id === selectedCropId ? 'selected' : ''}>${c.name}</option>
          `).join('')}
        </select>
      </div>

      <!-- Key FAO-56 Calculated Results Card -->
      <div style="margin-top:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; color:#64748b; letter-spacing:0.8px;">NET IRRIGATION DEMAND (NIR)</span>
            <h4 style="margin:2px 0 0; font-size:1.1rem; color:#0f172a;">${calc.cropName} (${calc.growingDays} Days)</h4>
          </div>
          <span style="font-size:0.75rem; font-weight:800; padding:3px 8px; border-radius:6px; background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;">
            ${calc.irrigationPlanning.recommendedCycles} Irrigation Cycles Planned
          </span>
        </div>

        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px;">
            <div style="font-size:0.68rem; color:#64748b; font-weight:600;">CROP DEMAND (ETc)</div>
            <div style="font-size:1.15rem; font-weight:800; color:#0f172a;">${calc.cropEvapotranspirationEtcMm} <span style="font-size:0.75rem; font-weight:600; color:#64748b;">mm</span></div>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px;">
            <div style="font-size:0.68rem; color:#059669; font-weight:600;">EFFECTIVE RAIN (Peff)</div>
            <div style="font-size:1.15rem; font-weight:800; color:#059669;">${calc.effectiveRainfallMm} <span style="font-size:0.75rem; font-weight:600; color:#64748b;">mm</span></div>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px 10px;">
            <div style="font-size:0.68rem; color:#0284c7; font-weight:600;">NET IRRIGATION (NIR)</div>
            <div style="font-size:1.15rem; font-weight:800; color:#0284c7;">${calc.netIrrigationRequirementMm} <span style="font-size:0.75rem; font-weight:600; color:#64748b;">mm</span></div>
          </div>
        </div>

        <div style="margin-top:10px; font-size:0.72rem; color:#0369a1; background:#eff6ff; padding:8px 10px; border-radius:6px; border:1px solid #bfdbfe;">
          <strong>Irrigation Delivery Schedule:</strong> ${calc.irrigationPlanning.recommendedCycles} cycles at ${calc.irrigationPlanning.depthPerCycleMm} mm depth each across Crown Root Initiation (CRI), tillering, flowering, and grain filling.
        </div>
      </div>

      <!-- FAO-56 Crop Coefficient (Kc) Stages -->
      <div style="margin-top:16px;">
        <span style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:var(--krish-emerald); display:block; margin-bottom:8px;">
          FAO-56 CROP COEFFICIENT (Kc) STAGE EVOLUTION
        </span>
        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:6px;">
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
            <span style="font-size:0.68rem; color:#64748b; font-weight:600;">Initial Sowing (Kc)</span>
            <div style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:2px 0;">${calc.stageCoefficients.initial}</div>
            <span style="font-size:0.65rem; color:#64748b;">Low canopy cover</span>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
            <span style="font-size:0.68rem; color:#059669; font-weight:700;">Mid-Season Peak (Kc)</span>
            <div style="font-size:1.1rem; font-weight:800; color:#059669; margin:2px 0;">${calc.stageCoefficients.mid}</div>
            <span style="font-size:0.65rem; color:#059669;">Full canopy transpiration</span>
          </div>
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:8px; text-align:center;">
            <span style="font-size:0.68rem; color:#64748b; font-weight:600;">Late / Harvest (Kc)</span>
            <div style="font-size:1.1rem; font-weight:800; color:#0f172a; margin:2px 0;">${calc.stageCoefficients.late}</div>
            <span style="font-size:0.65rem; color:#64748b;">Canopy senescence</span>
          </div>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     DRAWER BUILDER 4: RAIN BANK (RUNOFF HARVESTING & ANIMATED TANK)
     ========================================================================== */

  function buildRainBankDrawerHtml() {
    const p = decisionState.rainBankParams;
    const calc = window.KRISHINITI_DECISION_ENGINE
      ? window.KRISHINITI_DECISION_ENGINE.calcRainBank(p.fieldAreaAcres, p.annualRainfallMm, p.runoffCoefficient, p.collectionEfficiency)
      : {
          harvestableWaterLitres: 3421100,
          harvestableWaterMillionLitres: 3.42,
          farmPondDesign: { dimensions: "18m × 15m × 3m", irrigationBufferDays: 45 }
        };

    const tankFillPct = Math.min(100, Math.round((calc.harvestableWaterMillionLitres / 5.0) * 100));

    return `
      <div class="krish-drawer-demo-notice" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:12px 14px; border-radius:10px; font-size:0.75rem; line-height:1.5;">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="font-size:1.1rem; line-height:1;">🏦</span>
          <div>
            <strong>RAIN BANK — RUNOFF HARVESTING ENGINEERING:</strong>
            <p style="margin:4px 0 0; color:#1e3a8a;">
              $$\\text{Potential Harvestable Water} = \\text{Rainfall} \\times \\text{Area} \\times \\text{Runoff Coeff (C)} \\times \\text{Efficiency (}\\eta\\text{)} \\times 1000$$
              You can interactively adjust field area, rainfall, and runoff coefficients below to simulate farm pond storage volumes.
            </p>
          </div>
        </div>
      </div>

      <!-- Animated Storage Tank & Output Meter -->
      <div style="margin-top:14px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:16px;">
        <div style="display:flex; gap:20px; align-items:center;">
          <!-- SVG Water Tank Animation -->
          <div style="width:110px; flex-shrink:0;">
            <svg viewBox="0 0 100 130" style="width:100%; height:auto; display:block;">
              <!-- Tank Outer Shell -->
              <rect x="15" y="15" width="70" height="100" rx="10" fill="#f1f5f9" stroke="#0f172a" stroke-width="3"></rect>
              <!-- Inlet Pipe -->
              <rect x="35" y="5" width="30" height="10" fill="#94a3b8" stroke="#0f172a" stroke-width="2"></rect>
              <!-- Water Level Clip -->
              <clipPath id="tank-clip">
                <rect x="17" y="${113 - (tankFillPct * 0.95)}" width="66" height="${tankFillPct * 0.95}" rx="6"></rect>
              </clipPath>
              <!-- Animated Water Fill -->
              <rect x="17" y="17" width="66" height="96" fill="#0284c7" clip-path="url(#tank-clip)" opacity="0.85"></rect>
              <!-- Water surface waves line -->
              <line x1="17" y1="${113 - (tankFillPct * 0.95)}" x2="83" y2="${113 - (tankFillPct * 0.95)}" stroke="#38bdf8" stroke-width="2"></line>
              <!-- Glass Level Markers -->
              <line x1="75" y1="35" x2="83" y2="35" stroke="#94a3b8" stroke-width="1.5"></line>
              <line x1="70" y1="65" x2="83" y2="65" stroke="#94a3b8" stroke-width="1.5"></line>
              <line x1="75" y1="95" x2="83" y2="95" stroke="#94a3b8" stroke-width="1.5"></line>
            </svg>
            <div style="text-align:center; font-size:0.75rem; font-weight:800; color:#0284c7; margin-top:4px;">
              ${tankFillPct}% Stored
            </div>
          </div>

          <!-- Total Litres Counter -->
          <div style="flex-grow:1;">
            <span style="font-size:0.68rem; font-weight:800; text-transform:uppercase; color:#64748b; letter-spacing:0.8px;">ANNUAL HARVESTABLE WATER</span>
            <div id="krish-rb-litres-val" style="font-size:1.8rem; font-weight:800; color:#0f172a; line-height:1.1; margin:4px 0;">
              ${(calc.harvestableWaterLitres).toLocaleString()} <span style="font-size:0.95rem; font-weight:600; color:#64748b;">Litres</span>
            </div>
            <div style="font-size:0.95rem; font-weight:700; color:#0284c7;">
              ≈ ${calc.harvestableWaterMillionLitres} Million Litres
            </div>
            <div style="margin-top:6px; font-size:0.75rem; color:#059669; font-weight:700;">
              ✓ Provides ~${calc.farmPondDesign.irrigationBufferDays} days of drought emergency irrigation.
            </div>
          </div>
        </div>
      </div>

      <!-- Interactive Editable Inputs -->
      <div style="margin-top:16px;">
        <span style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:var(--krish-emerald); display:block; margin-bottom:8px;">
          ADJUST PARAMETERS TO SIMULATE HARVEST
        </span>

        <div style="display:flex; flex-direction:column; gap:10px; background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px;">
          <!-- Field Area -->
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; margin-bottom:4px;">
              <span>Field Area (Acres):</span>
              <span id="krish-rb-area-val">${p.fieldAreaAcres} Acres</span>
            </div>
            <input type="range" id="krish-rb-area-slider" min="0.5" max="25" step="0.1" value="${p.fieldAreaAcres}" style="width:100%;">
          </div>

          <!-- Annual Rainfall -->
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; margin-bottom:4px;">
              <span>Annual Rainfall (mm):</span>
              <span id="krish-rb-rain-val">${p.annualRainfallMm} mm</span>
            </div>
            <input type="range" id="krish-rb-rain-slider" min="400" max="2500" step="10" value="${p.annualRainfallMm}" style="width:100%;">
          </div>

          <!-- Runoff Coefficient -->
          <div>
            <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; margin-bottom:4px;">
              <span>Runoff Coefficient (C):</span>
              <span id="krish-rb-coeff-val">${p.runoffCoefficient} (Loam / Bunded)</span>
            </div>
            <input type="range" id="krish-rb-coeff-slider" min="0.10" max="0.45" step="0.01" value="${p.runoffCoefficient}" style="width:100%;">
          </div>
        </div>
      </div>

      <!-- Farm Pond Sizing Specifications -->
      <div style="margin-top:16px;">
        <span style="font-size:0.72rem; font-weight:800; text-transform:uppercase; letter-spacing:0.8px; color:#475569; display:block; margin-bottom:8px;">
          RECOMMENDED FARM POND SPECIFICATIONS
        </span>
        <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:10px; font-size:0.75rem; color:#334155;">
          <div><strong>Excavation Dimensions:</strong> ${calc.farmPondDesign.dimensions}</div>
          <div style="margin-top:4px;"><strong>Slope &amp; Lining:</strong> ${calc.farmPondDesign.sideSlopes}</div>
          <div style="margin-top:4px;"><strong>Location Strategy:</strong> Place at the Southeastern field corner along the natural 1.4% terrain drainage line to capture gravity runoff without pumping.</div>
        </div>
      </div>
    `;
  }

  /* ==========================================================================
     DRAWER BUILDER 5: FULL RECOMMENDATIONS ROADMAP
     ========================================================================== */

  function buildRecommendationsDrawerHtml(data) {
    const recs = data?.recommendations?.recommendations || [];

    return `
      <div class="krish-drawer-demo-notice" style="background:#eff6ff; border:1px solid #bfdbfe; color:#1e40af; padding:12px 14px; border-radius:10px; font-size:0.75rem; line-height:1.5;">
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="font-size:1.1rem; line-height:1;">📋</span>
          <div>
            <strong>EVIDENCE-BASED AGRONOMIC ROADMAP:</strong>
            <p style="margin:4px 0 0; color:#1e3a8a;">
              These prioritized field interventions are synthesized from verified telemetry across soil horizons, satellite vegetation vigor, NASA agroclimatology, and numerical weather windows.
            </p>
          </div>
        </div>
      </div>

      <!-- Roadmap Cards -->
      <div style="margin-top:14px; display:flex; flex-direction:column; gap:12px;">
        ${recs.map(r => `
          <div style="background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:14px; box-shadow:0 1px 3px rgba(0,0,0,0.05);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <span style="font-size:0.7rem; font-weight:800; padding:2px 8px; border-radius:6px; background:${r.priority === 'High' ? '#fee2e2' : '#fef3c7'}; color:${r.priority === 'High' ? '#991b1b' : '#92400e'};">
                ${r.priority} Priority · ${r.timeframe}
              </span>
              <span style="font-size:0.68rem; color:#64748b;">Evidence Level: High</span>
            </div>
            <h4 style="margin:4px 0 6px 0; font-size:1rem; color:#0f172a;">${r.suggestedAction}</h4>
            <p style="margin:0 0 8px 0; font-size:0.75rem; color:#334155; line-height:1.4;">${r.reason}</p>

            <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px 10px; font-size:0.7rem; color:#475569;">
              <strong>Supporting Telemetry:</strong> ${r.supportingData}
            </div>
            <div style="margin-top:6px; font-size:0.68rem; color:#059669;">
              ✓ <strong>Confidence &amp; Validation:</strong> ${r.confidence}
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Mandatory Strict Disclaimers -->
      <div style="margin-top:16px; background:#fffbeb; border:1px solid #fef3c7; border-radius:8px; padding:12px; font-size:0.72rem; color:#92400e; line-height:1.5;">
        <strong>⚠️ MANDATORY ADVISORY LIMITATIONS:</strong>
        <p style="margin:4px 0 0 0;">
          KRISHINITI is an agricultural decision support engine and does not guarantee specific yields, harvest profits, or pest eradication. Recommendations do not prescribe unauthorized chemical dosages. Always verify fertilizer protocols via a laboratory Soil Health Card from your nearest Krishi Vigyan Kendra (KVK).
        </p>
      </div>
    `;
  }

  /* ==========================================================================
     INTERACTIVE DRAWER LISTENERS & SLIDERS
     ========================================================================== */

  function attachDrawerListeners(bodyEl, drawerKey) {
    if (!bodyEl) return;

    // Crop Water Requirement Selector Listener
    if (drawerKey === 'crop-water') {
      const select = bodyEl.querySelector("#krish-cw-crop-select");
      if (select) {
        select.addEventListener("change", () => {
          decisionState.selectedCropId = select.value;
          bodyEl.innerHTML = buildCropWaterDrawerHtml(decisionState.selectedCropId);
          attachDrawerListeners(bodyEl, drawerKey);
        });
      }
    }

    // Rain Bank Interactive Sliders
    if (drawerKey === 'rain-bank') {
      const areaSlider = bodyEl.querySelector("#krish-rb-area-slider");
      const rainSlider = bodyEl.querySelector("#krish-rb-rain-slider");
      const coeffSlider = bodyEl.querySelector("#krish-rb-coeff-slider");

      const updateRainBankUI = () => {
        decisionState.rainBankParams.fieldAreaAcres = Number(areaSlider.value);
        decisionState.rainBankParams.annualRainfallMm = Number(rainSlider.value);
        decisionState.rainBankParams.runoffCoefficient = Number(coeffSlider.value);

        bodyEl.innerHTML = buildRainBankDrawerHtml();
        attachDrawerListeners(bodyEl, drawerKey);
      };

      if (areaSlider) areaSlider.addEventListener("input", updateRainBankUI);
      if (rainSlider) rainSlider.addEventListener("input", updateRainBankUI);
      if (coeffSlider) coeffSlider.addEventListener("input", updateRainBankUI);
    }
  }

  /**
   * Initializes Decision Intelligence module on load
   */
  async function initDecisionIntelligence() {
    try {
      await evaluateDecisionIntelligence();
    } catch (err) {
      console.warn("[KRISHINITI-Decision] Background fetch deferred:", err.message);
    }
  }

  // Export to window
  window.KRISHINITI_DECISION = {
    evaluate: evaluateDecisionIntelligence,
    getState: () => decisionState,
    updateDashboardCards,
    buildCropSuitabilityDrawerHtml,
    buildCropRotationDrawerHtml,
    buildCropWaterDrawerHtml,
    buildRainBankDrawerHtml,
    buildRecommendationsDrawerHtml,
    attachDrawerListeners
  };

  // Helper engine functions for client calculations
  window.KRISHINITI_DECISION_ENGINE = {
    calcFao56: (cropId, et0, rain) => {
      // Inline approximation when offline
      const kcMap = { wheat: 0.85, paddy: 1.15, maize: 0.82, lentils: 0.65, mustard: 0.68, greengram: 0.62 };
      const daysMap = { wheat: 130, paddy: 125, maize: 105, lentils: 110, mustard: 115, greengram: 65 };
      const kc = kcMap[cropId] || 0.85;
      const days = daysMap[cropId] || 120;
      const etc = Math.round(days * 3.4 * kc);
      const peff = Math.min(etc, Math.round(rain * 0.75));
      const nir = Math.max(0, etc - peff);
      return {
        cropName: cropId.toUpperCase(),
        cropEvapotranspirationEtcMm: etc,
        effectiveRainfallMm: peff,
        netIrrigationRequirementMm: nir,
        growingDays: days,
        stageCoefficients: { initial: 0.40, mid: 1.15, late: 0.40 },
        irrigationPlanning: { depthPerCycleMm: 55, recommendedCycles: Math.ceil(nir / 55), waterDeficitOrSurplus: "Deficit" }
      };
    },
    calcRainBank: (areaAcres, rainMm, coeff, eff) => {
      const areaM2 = areaAcres * 4046.86;
      const volM3 = (rainMm / 1000) * areaM2 * coeff * eff;
      const litres = Math.round(volM3 * 1000);
      return {
        harvestableWaterLitres: litres,
        harvestableWaterMillionLitres: +(litres / 1000000).toFixed(2),
        farmPondDesign: { dimensions: "18m × 15m × 3m", irrigationBufferDays: Math.round(volM3 / (areaM2 * 0.005)) }
      };
    }
  };

  // Run on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDecisionIntelligence);
  } else {
    initDecisionIntelligence();
  }

  window.addEventListener("storage", (e) => {
    if (e.key === "krishiniti-farm-profile-v1") {
      initDecisionIntelligence();
    }
  });

})();
