const fs = require('fs');

console.log("Testing OpenCode Provider Integration in popup.js and popup.html...");

const popupJsContent = fs.readFileSync('./popup.js', 'utf8');
const popupHtmlContent = fs.readFileSync('./popup.html', 'utf8');

// Test 1: OpenCode constants presence
if (!popupJsContent.includes('OPENCODE_URL = "https://opencode.ai/zen/v1/chat/completions"')) {
  throw new Error("OPENCODE_URL constant missing from popup.js");
}
console.log("✓ Test 1: OPENCODE_URL constant defined correctly");

// Test 2: Free models list presence
if (!popupJsContent.includes('OPENCODE_FREE_MODELS = [')) {
  throw new Error("OPENCODE_FREE_MODELS array missing from popup.js");
}
console.log("✓ Test 2: OPENCODE_FREE_MODELS array defined correctly");

// Test 3: Preset presence in PRESETS object
if (!popupJsContent.includes('opencode: {') || !popupJsContent.includes('OpenCode Zen')) {
  throw new Error("OpenCode preset missing from PRESETS in popup.js");
}
console.log("✓ Test 3: OpenCode preset included in PRESETS");

// Test 4: OpenCode in built-in select options
if (!popupHtmlContent.includes('data-preset="opencode"')) {
  throw new Error("data-preset='opencode' missing from popup.html");
}
console.log("✓ Test 4: OpenCode preset chip present in popup.html");

// Test 5: OpenCode built-in option in HTML
if (!popupHtmlContent.includes('value="opencode"')) {
  throw new Error("value='opencode' option missing from providerSelect in popup.html");
}
console.log("✓ Test 5: OpenCode Zen option present in popup.html");

console.log("\nALL OPENCODE INTEGRATION TESTS PASSED SUCCESSFULLY! 🎉");
