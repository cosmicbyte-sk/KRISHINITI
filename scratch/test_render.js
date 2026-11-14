const fs = require("fs");
const path = require("path");

// Mock browser document & element
const elements = {};
function element(id) {
  if (!elements[id]) {
    elements[id] = {
      id,
      innerHTML: "",
      textContent: "",
      classList: {
        add: () => {},
        remove: () => {},
        toggle: () => {}
      },
      querySelectorAll: () => [],
      querySelector: () => ({ textContent: "" }),
      dataset: {}
    };
  }
  return elements[id];
}
global.document = {
  getElementById: element,
  querySelectorAll: () => [],
  querySelector: () => null,
  addEventListener: () => {}
};
global.window = {
  location: { hash: "", pathname: "/", hostname: "cosmicbyte-sk.github.io" },
  addEventListener: () => {},
  print: () => {}
};

console.log("Mock environment initialized successfully.");
