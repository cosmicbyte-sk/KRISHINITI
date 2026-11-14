const engine = require("../public/KRISHINITI.action-plan-engine.js");

console.time("ActionPlanExecution");
const plan = engine.generateClientActionPlan({ lat: 25.86, lng: 85.78, scenario: "rainfed" });
console.timeEnd("ActionPlanExecution");

console.log("Rotations count:", plan.actionPlan?.rotations?.length);
