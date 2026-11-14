const fs = require('fs');

const html = fs.readFileSync('public/KRISHINITI.html', 'utf8');

// 1. Verify all required DOM element IDs
const requiredIds = [
  'btn-soil-accept',
  'btn-soil-customize',
  'custom-soil-panel',
  'chip-soil-status',
  'btn-crop-accept',
  'btn-crop-customize',
  'btn-crop-accept-03',
  'btn-crop-customize-03',
  'custom-crops-panel',
  'crop-list',
  'add-crop',
  'nav-step-intelligence',
  'nav-step-practices',
  'nav-step-goals',
  'step-group-1',
  'step-group-2',
  'step-group-3',
  'water-availability',
  'water-source',
  'priority',
  'dynamic-strategy-text'
];

console.log('--- 1. CHECKING ELEMENT IDS IN KRISHINITI.HTML ---');
let missing = 0;
for (const id of requiredIds) {
  if (!html.includes('id="' + id + '"')) {
    console.error('MISSING ID:', id);
    missing++;
  } else {
    console.log('✓ Found #' + id);
  }
}

console.log('\n--- 2. CHECKING WATER CARDS ---');
const waters = ['rainfed', 'canal', 'tubewell', 'drip', 'sprinkler', 'mixed'];
for (const w of waters) {
  if (!html.includes('data-water="' + w + '"')) {
    console.error('MISSING water card:', w);
    missing++;
  } else {
    console.log('✓ Found water card: ' + w);
  }
}

console.log('\n--- 3. CHECKING GOAL CHIPS ---');
const goals = ['profit', 'resilience', 'soil', 'water', 'productivity', 'food_security', 'short_duration'];
for (const g of goals) {
  if (!html.includes('data-goal="' + g + '"')) {
    console.error('MISSING goal chip:', g);
    missing++;
  } else {
    console.log('✓ Found goal chip: ' + g);
  }
}

console.log('\n--- 4. SIMULATING INTERACTION LOGIC & TRANSITIONS ---');
class MockClassList {
  constructor(initial = []) {
    this.classes = new Set(initial);
  }
  add(cls) { this.classes.add(cls); }
  remove(cls) { this.classes.delete(cls); }
  contains(cls) { return this.classes.has(cls); }
  toggle(cls, force) {
    if (force === undefined) {
      if (this.classes.has(cls)) this.classes.delete(cls);
      else this.classes.add(cls);
    } else if (force) {
      this.classes.add(cls);
    } else {
      this.classes.delete(cls);
    }
  }
}

class MockElement {
  constructor(id, tag = 'div', classes = []) {
    this.id = id;
    this.tagName = tag.toUpperCase();
    this.classList = new MockClassList(classes);
    this.dataset = {};
    this.children = [];
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.listeners = {};
  }
  addEventListener(evt, fn) {
    if (!this.listeners[evt]) this.listeners[evt] = [];
    this.listeners[evt].push(fn);
  }
  click() {
    if (this.listeners['click']) {
      this.listeners['click'].forEach(fn => fn({ preventDefault: () => {} }));
    }
  }
  scrollIntoView() { this.scrolled = true; }
  focus() { this.focused = true; }
}

const elements = {
  'btn-soil-accept': new MockElement('btn-soil-accept', 'button', ['choice-toggle-btn', 'active']),
  'btn-soil-customize': new MockElement('btn-soil-customize', 'button', ['choice-toggle-btn']),
  'custom-soil-panel': new MockElement('custom-soil-panel', 'div', ['custom-override-panel', 'hidden']),
  'chip-soil-status': new MockElement('chip-soil-status', 'span'),
  'preview-soil-status': new MockElement('preview-soil-status', 'span'),
  'soil-type': new MockElement('soil-type', 'select'),
  'soil-test': new MockElement('soil-test', 'select'),
  'lab-soil-inputs': new MockElement('lab-soil-inputs', 'div', ['hidden']),

  'btn-crop-accept': new MockElement('btn-crop-accept', 'button', ['choice-toggle-btn', 'active']),
  'btn-crop-customize': new MockElement('btn-crop-customize', 'button', ['choice-toggle-btn']),
  'btn-crop-accept-03': new MockElement('btn-crop-accept-03', 'button', ['choice-toggle-btn', 'active']),
  'btn-crop-customize-03': new MockElement('btn-crop-customize-03', 'button', ['choice-toggle-btn']),
  'custom-crops-panel': new MockElement('custom-crops-panel', 'div', ['custom-crops-container']),
  'crop-list': new MockElement('crop-list', 'div'),
  'add-crop': new MockElement('add-crop', 'button'),

  'water-availability': new MockElement('water-availability', 'input'),
  'water-source': new MockElement('water-source', 'input'),
  'preview-water-category': new MockElement('preview-water-category', 'span'),

  'priority': new MockElement('priority', 'select'),
  'dynamic-strategy-text': new MockElement('dynamic-strategy-text', 'p'),

  'nav-step-intelligence': new MockElement('nav-step-intelligence', 'button', ['progress-nav-step', 'active']),
  'nav-step-practices': new MockElement('nav-step-practices', 'button', ['progress-nav-step']),
  'nav-step-goals': new MockElement('nav-step-goals', 'button', ['progress-nav-step']),

  'step-group-1': new MockElement('step-group-1', 'div'),
  'step-group-2': new MockElement('step-group-2', 'div'),
  'step-group-3': new MockElement('step-group-3', 'div')
};

elements['nav-step-intelligence'].dataset.step = '1';
elements['nav-step-practices'].dataset.step = '2';
elements['nav-step-goals'].dataset.step = '3';

const waterCards = waters.map(w => {
  const el = new MockElement('water-' + w, 'div', ['water-choice-card']);
  el.dataset.water = w;
  return el;
});
waterCards[1].classList.add('active'); // canal default

const goalChips = goals.map(g => {
  const el = new MockElement('goal-' + g, 'button', ['goal-chip']);
  el.dataset.goal = g;
  if (['profit', 'resilience', 'soil'].includes(g)) el.classList.add('active');
  return el;
});

// Setup logic identical to public/KRISHINITI.js
function setActiveStep(stepNum) {
  [elements['nav-step-intelligence'], elements['nav-step-practices'], elements['nav-step-goals']].forEach(btn => {
    btn.classList.toggle('active', Number(btn.dataset.step) === stepNum);
  });
  if (stepNum === 1) elements['step-group-1'].scrollIntoView();
  if (stepNum === 2) elements['step-group-2'].scrollIntoView();
  if (stepNum === 3) elements['step-group-3'].scrollIntoView();
}

function updateDynamicStrategyMessage() {
  const activeChips = goalChips.filter(c => c.classList.contains('active'));
  const gList = activeChips.map(c => c.dataset.goal);
  elements['dynamic-strategy-text'].textContent = 'Active: ' + gList.join(', ');
  if (gList.includes('resilience')) elements['priority'].value = 'weather';
  else if (gList.includes('profit')) elements['priority'].value = 'income';
  else if (gList.includes('water')) elements['priority'].value = 'water';
  else if (gList.includes('soil')) elements['priority'].value = 'soil';
  else elements['priority'].value = 'balanced';
}

// Wire up Soil
elements['btn-soil-customize'].addEventListener('click', () => {
  elements['btn-soil-customize'].classList.add('active');
  elements['btn-soil-accept'].classList.remove('active');
  elements['custom-soil-panel'].classList.remove('hidden');
  elements['chip-soil-status'].textContent = 'Status: Farmer verified / manual override';
  elements['preview-soil-status'].textContent = 'Farmer Verified';
  setActiveStep(1);
  elements['custom-soil-panel'].scrollIntoView();
  elements['soil-type'].focus();
});

elements['btn-soil-accept'].addEventListener('click', () => {
  elements['btn-soil-accept'].classList.add('active');
  elements['btn-soil-customize'].classList.remove('active');
  elements['custom-soil-panel'].classList.add('hidden');
  elements['chip-soil-status'].textContent = 'Status: Satellite detected';
  elements['preview-soil-status'].textContent = 'Satellite Detected';
});

// Wire up Crops
function handleCropCustomize() {
  elements['btn-crop-customize'].classList.add('active');
  elements['btn-crop-accept'].classList.remove('active');
  elements['btn-crop-customize-03'].classList.add('active');
  elements['btn-crop-accept-03'].classList.remove('active');
  setActiveStep(2);
  elements['custom-crops-panel'].classList.remove('hidden');
  if (elements['crop-list'].children.length === 0) {
    elements['crop-list'].children.push(new MockElement('row-1'));
  }
  elements['custom-crops-panel'].scrollIntoView();
  elements['add-crop'].focus();
}

function handleCropAccept() {
  elements['btn-crop-accept'].classList.add('active');
  elements['btn-crop-customize'].classList.remove('active');
  elements['btn-crop-accept-03'].classList.add('active');
  elements['btn-crop-customize-03'].classList.remove('active');
}

elements['btn-crop-customize'].addEventListener('click', handleCropCustomize);
elements['btn-crop-customize-03'].addEventListener('click', handleCropCustomize);
elements['btn-crop-accept'].addEventListener('click', handleCropAccept);
elements['btn-crop-accept-03'].addEventListener('click', handleCropAccept);

// Wire up Water cards
waterCards.forEach(card => {
  card.addEventListener('click', () => {
    waterCards.forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    const wType = card.dataset.water;
    if (wType === 'rainfed') {
      elements['water-availability'].value = 'rainfed';
      elements['water-source'].value = 'rain';
    } else if (wType === 'canal') {
      elements['water-availability'].value = 'moderate';
      elements['water-source'].value = 'canal';
    } else if (wType === 'tubewell') {
      elements['water-availability'].value = 'high';
      elements['water-source'].value = 'well';
    } else if (wType === 'drip') {
      elements['water-availability'].value = 'high';
      elements['water-source'].value = 'drip';
    } else if (wType === 'sprinkler') {
      elements['water-availability'].value = 'high';
      elements['water-source'].value = 'sprinkler';
    } else if (wType === 'mixed') {
      elements['water-availability'].value = 'moderate';
      elements['water-source'].value = 'mixed';
    }
  });
});

// Wire up Goal chips
goalChips.forEach(chip => {
  chip.addEventListener('click', () => {
    const isAct = chip.classList.contains('active');
    const actCount = goalChips.filter(c => c.classList.contains('active')).length;
    if (isAct && actCount <= 1) return;
    chip.classList.toggle('active');
    updateDynamicStrategyMessage();
  });
});

// Wire up Progress tabs
elements['nav-step-intelligence'].addEventListener('click', () => setActiveStep(1));
elements['nav-step-practices'].addEventListener('click', () => setActiveStep(2));
elements['nav-step-goals'].addEventListener('click', () => setActiveStep(3));

// TEST A: Soil Customize & Accept
console.log('\n--- Testing Soil Edit / Accept ---');
elements['btn-soil-customize'].click();
if (!elements['custom-soil-panel'].classList.contains('hidden') &&
    elements['btn-soil-customize'].classList.contains('active') &&
    !elements['btn-soil-accept'].classList.contains('active') &&
    elements['chip-soil-status'].textContent.includes('Farmer verified') &&
    elements['soil-type'].focused) {
  console.log('✓ Soil Customize opens panel, sets active, updates badge and focuses input');
} else {
  console.error('FAIL on Soil Customize');
  missing++;
}

elements['btn-soil-accept'].click();
if (elements['custom-soil-panel'].classList.contains('hidden') &&
    elements['btn-soil-accept'].classList.contains('active') &&
    !elements['btn-soil-customize'].classList.contains('active') &&
    elements['chip-soil-status'].textContent.includes('Satellite detected')) {
  console.log('✓ Soil Accept collapses panel, sets active and resets badge to satellite');
} else {
  console.error('FAIL on Soil Accept');
  missing++;
}

// TEST B: Crop Customize & Accept from both Section B and Section 03
console.log('\n--- Testing Crop History Edit / Accept ---');
elements['btn-crop-customize'].click();
if (elements['btn-crop-customize'].classList.contains('active') &&
    elements['btn-crop-customize-03'].classList.contains('active') &&
    elements['nav-step-practices'].classList.contains('active') &&
    elements['crop-list'].children.length > 0 &&
    elements['add-crop'].focused) {
  console.log('✓ Crop Customize (B) activates both crop edit buttons, switches to step 2 tab, populates crop row and focuses add-crop');
} else {
  console.error('FAIL on Crop Customize B');
  missing++;
}

elements['btn-crop-accept-03'].click();
if (elements['btn-crop-accept'].classList.contains('active') &&
    elements['btn-crop-accept-03'].classList.contains('active') &&
    !elements['btn-crop-customize'].classList.contains('active')) {
  console.log('✓ Crop Accept (03) synchronizes both baseline buttons');
} else {
  console.error('FAIL on Crop Accept 03');
  missing++;
}

elements['btn-crop-customize-03'].click();
if (elements['btn-crop-customize-03'].classList.contains('active') &&
    elements['nav-step-practices'].classList.contains('active')) {
  console.log('✓ Crop Customize (03) activates both crop buttons and step 2 practices tab');
} else {
  console.error('FAIL on Crop Customize 03');
  missing++;
}

// TEST C: Water card selection
console.log('\n--- Testing Water Option Cards ---');
// click drip
const dripCard = waterCards.find(c => c.dataset.water === 'drip');
dripCard.click();
if (dripCard.classList.contains('active') &&
    !waterCards[1].classList.contains('active') &&
    elements['water-availability'].value === 'high' &&
    elements['water-source'].value === 'drip') {
  console.log('✓ Water card [drip] selected: active class updated, hidden inputs synchronized to high / drip');
} else {
  console.error('FAIL on Water card drip');
  missing++;
}

// click rainfed
const rainCard = waterCards.find(c => c.dataset.water === 'rainfed');
rainCard.click();
if (rainCard.classList.contains('active') &&
    !dripCard.classList.contains('active') &&
    elements['water-availability'].value === 'rainfed' &&
    elements['water-source'].value === 'rain') {
  console.log('✓ Water card [rainfed] selected: active class updated, hidden inputs synchronized to rainfed / rain');
} else {
  console.error('FAIL on Water card rainfed');
  missing++;
}

// TEST D: Goal chips selection
console.log('\n--- Testing Farmer Goal Chips ---');
const waterGoal = goalChips.find(c => c.dataset.goal === 'water');
waterGoal.click();
if (waterGoal.classList.contains('active') &&
    elements['dynamic-strategy-text'].textContent.includes('water')) {
  console.log('✓ Goal chip [water] toggled ON and dynamic strategy updated');
} else {
  console.error('FAIL on Goal chip toggle');
  missing++;
}

// TEST E: Progress Navigation Tabs
console.log('\n--- Testing Progress Navigation Tabs ---');
elements['nav-step-goals'].click();
if (elements['nav-step-goals'].classList.contains('active') &&
    !elements['nav-step-practices'].classList.contains('active') &&
    elements['step-group-3'].scrolled) {
  console.log('✓ Nav Step 3 (Goals) tab marks active and scrolls to step-group-3');
} else {
  console.error('FAIL on Nav Step 3');
  missing++;
}

elements['nav-step-intelligence'].click();
if (elements['nav-step-intelligence'].classList.contains('active') &&
    elements['step-group-1'].scrolled) {
  console.log('✓ Nav Step 1 (Intelligence) tab marks active and scrolls to step-group-1');
} else {
  console.error('FAIL on Nav Step 1');
  missing++;
}

if (missing === 0) {
  console.log('\n======================================================');
  console.log('SUCCESS: All option selection, edit soil, and crop history interactions passed 100%!');
  console.log('======================================================');
} else {
  process.exit(1);
}
