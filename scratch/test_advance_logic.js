// scratch/test_advance_logic.js
// Verification of single-advance execution, click deduplication, and jump recovery

const assert = require("assert");

console.log("=== RUNNING ADVANCE & JUMP RECOVERY TEST SUITE ===");

// 1. Test Single Button Selection & Event Counting Simulation
{
  console.log("\n[Test 1] Simulating DOM buttons and click event counting...");

  class MockElement {
    constructor(tagName, text, id = "") {
      this.tagName = tagName.toUpperCase();
      this.innerText = text;
      this.value = text;
      this.id = id;
      this.disabled = false;
      this.offsetParent = {}; // visible
      this.events = [];
    }
    getAttribute(name) {
      return this[name] || null;
    }
    dispatchEvent(evt) {
      this.events.push(evt.type);
    }
    click() {
      this.events.push("click_method");
    }
  }

  const saveBtn = new MockElement("button", "Save", "btn-save");
  const saveNextBtn = new MockElement("button", "Save & Next", "btn-save-next");
  const nextBtn = new MockElement("button", "Next", "btn-next");

  const allBtns = [saveBtn, saveNextBtn, nextBtn];
  const isSubmit = el => /(submit|finish|end test|end quiz|done)/i.test((el.innerText || el.value || "").trim());
  const eligible = allBtns.filter(el => !isSubmit(el) && !el.disabled && el.getAttribute("aria-disabled") !== "true" && el.offsetParent !== null);

  // Priority 1: Save & Next
  let targetBtn = eligible.find(el => /(save\s*(&|and|\+)?\s*(next|proceed|continue)|save\s+next)/i.test((el.innerText || el.value || "").trim()));
  if (!targetBtn) {
    targetBtn = eligible.find(el => /\bnext\s*(question)?\b/i.test((el.innerText || el.value || "").trim()));
  }
  if (!targetBtn) {
    targetBtn = eligible.find(el => /^\s*save\s*$/i.test((el.innerText || el.value || "").trim()));
  }

  assert.strictEqual(targetBtn, saveNextBtn, "Must exclusively choose 'Save & Next' when both Save and Save & Next exist");

  // Perform single-click sequence
  const clickProps = { bubbles: true, cancelable: true };
  ["pointerdown", "mousedown", "pointerup", "mouseup"].forEach(t => {
    targetBtn.dispatchEvent({ type: t });
  });
  targetBtn.click();

  // Verify events dispatched on Save & Next
  assert.deepStrictEqual(
    targetBtn.events,
    ["pointerdown", "mousedown", "pointerup", "mouseup", "click_method"],
    "Should dispatch prep events and exactly ONE click method"
  );

  // Verify Save button and Next button were NOT touched
  assert.strictEqual(saveBtn.events.length, 0, "Standalone Save button must NOT be clicked when Save & Next is present");
  assert.strictEqual(nextBtn.events.length, 0, "Standalone Next button must NOT be clicked when Save & Next is present");

  console.log("✓ PASS: Exclusively selected Save & Next and delivered exactly ONE click.");
}

// 2. Test Standalone Next when no Save & Next is present
{
  console.log("\n[Test 2] Standalone Next button selection...");

  class MockElement {
    constructor(tagName, text) {
      this.tagName = tagName.toUpperCase();
      this.innerText = text;
      this.value = text;
      this.disabled = false;
      this.offsetParent = {};
      this.events = [];
    }
    getAttribute() { return null; }
    dispatchEvent(evt) { this.events.push(evt.type); }
    click() { this.events.push("click_method"); }
  }

  const nextBtn = new MockElement("button", "Next Question");
  const clearBtn = new MockElement("button", "Clear Response");
  const eligible = [clearBtn, nextBtn].filter(el => el.innerText !== "Clear Response");

  let targetBtn = eligible.find(el => /(save\s*(&|and|\+)?\s*(next|proceed|continue)|save\s+next)/i.test((el.innerText || el.value || "").trim()));
  if (!targetBtn) {
    targetBtn = eligible.find(el => /\bnext\s*(question)?\b/i.test((el.innerText || el.value || "").trim()));
  }

  assert.strictEqual(targetBtn, nextBtn, "Must choose Next Question when no Save & Next exists");
  targetBtn.click();
  assert.strictEqual(targetBtn.events.length, 1);
  console.log("✓ PASS: Selected Next Question cleanly.");
}

// 3. Test Action Sanitization in safeActions
{
  console.log("\n[Test 3] Action sanitization (deduplication of advance actions)...");

  const rawActions = [
    { action: "select_radio", params: { option: "B", text: "Paris" } },
    { action: "click", params: { selector: "text:Save & Next" } },
    { action: "click_next", params: {} },
    { action: "click_next", params: {} }
  ];

  let seenAdvanceAction = false;
  const safeActions = rawActions.filter(a => {
    const isAdvance = a.action === "click_next" || (a.action === "click" && /(next|save\s*(&|and)?\s*next|proceed|continue)/i.test(a.params?.selector || ""));
    if (isAdvance) {
      if (seenAdvanceAction) return false;
      seenAdvanceAction = true;
      a.action = "click_next";
    }
    return true;
  });

  assert.strictEqual(safeActions.length, 2, "Must contain exactly 2 actions: 1 select_radio and 1 click_next");
  assert.strictEqual(safeActions[0].action, "select_radio");
  assert.strictEqual(safeActions[1].action, "click_next");

  console.log("✓ PASS: Sanitized multiple conflicting advance actions down to exactly 1.");
}

// 4. Test 1000ms Debounce Guard
{
  console.log("\n[Test 4] 1000ms debounce guard verification...");

  let lastClick = 0;
  function attemptAdvance(currentTime) {
    if (currentTime - lastClick < 1000) {
      return "DEBOUNCED";
    }
    lastClick = currentTime;
    return "CLICKED";
  }

  assert.strictEqual(attemptAdvance(1000), "CLICKED");
  assert.strictEqual(attemptAdvance(1050), "DEBOUNCED"); // 50ms later -> rejected
  assert.strictEqual(attemptAdvance(1500), "DEBOUNCED"); // 500ms later -> rejected
  assert.strictEqual(attemptAdvance(2001), "CLICKED");   // 1001ms later -> allowed

  console.log("✓ PASS: Rapid double-calls within 1000ms safely debounced.");
}

// 5. Test Jump Detection Logic
{
  console.log("\n[Test 5] Jump detection logic...");

  function checkJump(currentQ, afterQ, endQVal) {
    const expectedNextQ = currentQ + 1;
    if (expectedNextQ !== null && afterQ !== null && afterQ > expectedNextQ && expectedNextQ <= endQVal) {
      return { jumped: true, skippedQ: expectedNextQ, currentOn: afterQ };
    }
    return { jumped: false };
  }

  // Normal advance: Q17 -> Q18
  const normal = checkJump(17, 18, 50);
  assert.strictEqual(normal.jumped, false);

  // Jumped advance: Q17 -> Q19
  const jumped = checkJump(17, 19, 50);
  assert.strictEqual(jumped.jumped, true);
  assert.strictEqual(jumped.skippedQ, 18);
  assert.strictEqual(jumped.currentOn, 19);

  console.log("✓ PASS: Correctly flags jump when Q17 advances directly to Q19 and identifies Q18 as skipped.");
}

console.log("\n=== ALL ADVANCE LOGIC TESTS PASSED ===");
