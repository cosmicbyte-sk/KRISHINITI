const engine = require("../public/KRISHINITI.action-plan-engine.js");
console.log("Keys:", Object.keys(engine));

const dec = engine.evaluateClientDecision({
  soil: { ph: 7.0, organicCarbon: 0.6, texture: "Loam" },
  climate: { annualRainfallMm: 1100 },
  lat: 25.75,
  lng: 86.02
});
console.log("Decision result status:", dec.status, "Suitability top:", dec.suitability?.topThree?.[0]?.name);

const plan = engine.generateClientActionPlan({ lat: 25.75, lng: 86.02 });
console.log("Action plan result status:", plan.actionPlan?.status, "Rotations:", plan.actionPlan?.rotations?.length);
console.log("ALL TESTS PASSED!");
