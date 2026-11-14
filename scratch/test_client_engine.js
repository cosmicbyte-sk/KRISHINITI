const fs = require("fs");
const path = require("path");
const engine = require("../public/KRISHINITI.action-plan-engine.js");

const plan = engine.generateClientActionPlan({ lat: 25.86, lng: 85.78 });
console.log("Has metricDefinitions?", Boolean(plan.metricDefinitions));
console.log("Has metrics?", Boolean(plan.metrics));
console.log("Has annualSeries?", Boolean(plan.annualSeries));

// Let's inspect CORE_METRIC_IDS in public/KRISHINITI.action-plan.js
const apJs = fs.readFileSync(path.join(__dirname, "..", "public", "KRISHINITI.action-plan.js"), "utf8");
const coreMatch = apJs.match(/const CORE_METRIC_IDS = (\[[^\]]+\]);/);
console.log("CORE_METRIC_IDS:", coreMatch ? coreMatch[1] : "not found");
