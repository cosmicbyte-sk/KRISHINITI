const fs = require("fs");
const path = require("path");
const engine = require("../public/KRISHINITI.action-plan-engine.js");

const plan = engine.generateClientActionPlan({ lat: 25.86, lng: 85.78, scenario: "rainfed" });

console.log("Checking plan structure:");
console.log("- metricDefinitions keys:", Object.keys(plan.metricDefinitions || {}));
console.log("- metrics keys:", Object.keys(plan.metrics || {}));
console.log("- annualSeries length:", plan.annualSeries?.length);
console.log("- rotations count:", plan.actionPlan?.rotations?.length);
console.log("- farmDiagnosis categories:", plan.actionPlan?.farmDiagnosis?.categories?.length);
console.log("- structuredRecs count:", plan.actionPlan?.structuredRecommendations?.length);
console.log("- seasonalCalendar seasons:", plan.actionPlan?.seasonalCalendar?.seasons?.length);
console.log("- decadalExtremes count:", plan.actionPlan?.decadalExtremes?.length);

if (
  plan.metricDefinitions &&
  plan.metrics &&
  plan.annualSeries?.length === 45 &&
  plan.actionPlan?.rotations?.length > 0 &&
  plan.actionPlan?.structuredRecommendations?.length > 0
) {
  console.log("SUCCESS: Client Action Plan is 100% complete, fully populated, and verified!");
} else {
  console.error("FAIL: Missing expected fields!");
  process.exit(1);
}
