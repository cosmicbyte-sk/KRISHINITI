const fs = require('fs');
const assert = require('assert');
const path = require('path');

const htmlPath = path.join(__dirname, 'public', 'KRISHINITI.html');
const serverPath = path.join(__dirname, 'server.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const serverCode = fs.readFileSync(serverPath, 'utf8');

assert(serverCode.includes('/api/climate/analysis'), 'server.js must register the NASA POWER history analysis endpoint');
assert(html.includes('id="action-plan-screen"'), 'HTML should contain the Action Plan page');
assert(html.includes('KRISHINITI.action-plan.js') && html.includes('KRISHINITI.action-plan.css'), 'HTML should load the Action Plan assets');

const sectionStack = [];
let actionPlanNestedInLandReport = false;
for (const match of html.matchAll(/<\/?section\b[^>]*>/gi)) {
  const tag = match[0];
  if (tag.startsWith('</')) {
    sectionStack.pop();
  } else {
    if (/id="action-plan-screen"/.test(tag) && sectionStack.includes('analysis-screen')) actionPlanNestedInLandReport = true;
    const id = tag.match(/id="([^"]+)"/)?.[1] || null;
    sectionStack.push(id);
  }
}
assert.strictEqual(actionPlanNestedInLandReport, false, 'Action Plan must be a separate top-level page, not nested in the Land report');

console.log('✓ Phase 3 Action Plan HTML structure, assets, and server route verified successfully!');
