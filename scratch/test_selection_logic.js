// Unit test to verify option selection logic and parsing
const assert = require("assert");

// 1. Test parseAI logic
function parseAI(raw) {
  if (!raw) return { text: "", actions: [] };

  const tM = raw.match(/<thinking>([\s\S]*?)<\/thinking>/i);
  const rM = raw.match(/<response>([\s\S]*?)<\/response>/i);
  const aM = raw.match(/<actions>([\s\S]*?)<\/actions>/i);
  
  let text = "Analyzing question and executing...";
  if (tM) {
    text = tM[1].trim().slice(0, 150).replace(/\n/g, ' ') + "...";
  } else if (rM) {
    text = rM[1].trim().slice(0, 150).replace(/\n/g, ' ') + "...";
  }

  let actions = [];
  if (aM) {
    try { actions = JSON.parse(aM[1].trim()); } catch {
      const arrM = aM[1].match(/\[[\s\S]*\]/);
      if (arrM) { try { actions = JSON.parse(arrM[0]); } catch {} }
    }
  }

  if (actions.length === 0) {
    const codeBlockM = raw.match(/```(?:json)?\s*(\[\s*\{[\s\S]*?\}\s*\])\s*```/i);
    if (codeBlockM) {
      try { actions = JSON.parse(codeBlockM[1].trim()); } catch {}
    }
  }

  if (actions.length === 0) {
    const jsonArrM = raw.match(/\[\s*\{[\s\S]*?"action"[\s\S]*?\}\s*\]/);
    if (jsonArrM) {
      try { actions = JSON.parse(jsonArrM[0]); } catch {}
    }
  }

  if (actions.length === 0) {
    const letterMatch = raw.match(/(?:correct\s+(?:option|answer)|conclusion|answer|option)\s*(?:is|:)?\s*[\(\[]?([A-E])[\)\]]?/i)
                     || raw.match(/\b([A-E])\s*(?:is\s+the\s+correct\s+answer|is\s+correct)\b/i);
    if (letterMatch) {
      const optLetter = letterMatch[1].toUpperCase();
      actions = [
        { action: "select_radio", params: { option: optLetter, text: optLetter } },
        { action: "click_next" }
      ];
    }
  }

  return { text, actions };
}

// 2. Test candidate matching logic
function matchCandidate(params, candidates) {
  let targetIdx = -1;
  if (params.option) {
    const oStr = String(params.option).trim().toUpperCase();
    const m = oStr.match(/\b([A-E])\b/) || oStr.match(/^[A-E]$/);
    if (m) targetIdx = m[1].charCodeAt(0) - 65;
    else if (/^[1-5]$/.test(oStr)) targetIdx = parseInt(oStr) - 1;
  }
  if (targetIdx === -1 && params.index !== undefined && Number.isInteger(params.index)) {
    targetIdx = params.index;
  }

  const rawText = String(params.text || "").trim();
  const rawTarget = (rawText || (params.option ? String(params.option) : "")).trim();
  const lowerTarget = rawTarget.toLowerCase();

  if (targetIdx === -1) {
    const letterMatch = lowerTarget.match(/^(?:option\s+)?\(?([a-e])\)?(?:\s*[\.\:\-\)]|\s+|$)/i);
    if (letterMatch) {
      targetIdx = letterMatch[1].toLowerCase().charCodeAt(0) - 97;
    } else if (/^[a-e]$/i.test(lowerTarget)) {
      targetIdx = lowerTarget.charCodeAt(0) - 97;
    }
  }

  const coreTarget = lowerTarget
    .replace(/^(?:option\s+)?\(?[a-e0-9]\)?(?:\s*[\.\:\-\)]\s*|\s+)/i, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();

  let matchedCand = null;

  if (targetIdx >= 0 && targetIdx < candidates.length) {
    matchedCand = candidates[targetIdx];
  }

  let bestScore = -1;
  let textBest = null;
  for (const c of candidates) {
    const cTxt = c.text.toLowerCase().trim();
    const cleanCTxt = cTxt
      .replace(/^(?:option\s+)?\(?[a-e0-9]\)?(?:\s*[\.\:\-\)]\s*|\s+)/i, "")
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
      .trim();

    let score = 0;
    if (cTxt === lowerTarget || cleanCTxt === coreTarget || cTxt === coreTarget) {
      score = 100;
    } else if (coreTarget.length >= 2) {
      if (cleanCTxt.startsWith(coreTarget) || cTxt.startsWith(coreTarget)) score = 85;
      else if (cleanCTxt.includes(coreTarget) || cTxt.includes(coreTarget)) score = 70;
      else if (coreTarget.includes(cleanCTxt) && cleanCTxt.length >= 3) score = 60;
    }

    if (targetIdx >= 0 && c.idx === targetIdx) {
      score += 25;
    }

    if (score > bestScore) {
      bestScore = score;
      textBest = c;
    }
  }

  if (bestScore >= 60 && textBest) {
    matchedCand = textBest;
  } else if (!matchedCand && textBest && bestScore > 0) {
    matchedCand = textBest;
  }

  if (!matchedCand && targetIdx >= 0 && candidates.length > 0) {
    matchedCand = candidates[Math.min(targetIdx, candidates.length - 1)];
  }

  if (!matchedCand && candidates.length > 0) {
    matchedCand = candidates[0];
  }

  return matchedCand;
}

// RUN TESTS
console.log("Running Selection and Parsing Unit Tests...\n");

// Test 1: AI output with both option and short numeric text (e.g. Q1, Q3 on aptitude tests)
const candidates1 = [
  { idx: 0, text: "A) 1" },
  { idx: 1, text: "B) 2" },
  { idx: 2, text: "C) 3" },
  { idx: 3, text: "D) 4" }
];

const res1 = matchCandidate({ option: "B", text: "2" }, candidates1);
assert.strictEqual(res1.idx, 1, "Should match candidate 1 (B) 2");
console.log("✓ Test 1: Numerical option { option: 'B', text: '2' } matched idx 1 correctly");

// Test 2: AI output with option only
const res2 = matchCandidate({ option: "C" }, candidates1);
assert.strictEqual(res2.idx, 2, "Should match candidate 2 (C) 3");
console.log("✓ Test 2: Letter-only option { option: 'C' } matched idx 2 correctly");

// Test 3: AI output with text only matching verbal question
const candidates3 = [
  { idx: 0, text: "Central Processing Unit" },
  { idx: 1, text: "Random Access Memory" },
  { idx: 2, text: "Operating System" },
  { idx: 3, text: "Graphical User Interface" }
];
const res3 = matchCandidate({ text: "Operating System" }, candidates3);
assert.strictEqual(res3.idx, 2, "Should match candidate 2 (Operating System)");
console.log("✓ Test 3: Text-only option { text: 'Operating System' } matched idx 2 correctly");

// Test 4: Math/unformatted candidates (fallback to Option A..D labels)
const candidates4 = [
  { idx: 0, text: "Option A" },
  { idx: 1, text: "Option B" },
  { idx: 2, text: "Option C" },
  { idx: 3, text: "Option D" }
];
const res4 = matchCandidate({ option: "D", text: "x^2 + y^2 = 1" }, candidates4);
assert.strictEqual(res4.idx, 3, "Should match candidate 3 by option D");
console.log("✓ Test 4: Math equation with Option D matched idx 3 correctly");

// Test 5: Fallback when completely unmatched
const res5 = matchCandidate({ option: "Z", text: "Unknown" }, candidates1);
assert.ok(res5 !== null, "Should not return null (fallback to first candidate)");
assert.strictEqual(res5.idx, 0, "Fallback to candidate 0");
console.log("✓ Test 5: Fallback to Option A on unmatched target verified");

// Test 6: parseAI with standard <actions> tag
const standardRaw = `<response><thinking>Solve problem</thinking>Conclusion: Option B</response><actions>[{"action":"select_radio","params":{"option":"B","text":"2"}},{"action":"click_next"}]</actions>`;
const p1 = parseAI(standardRaw);
assert.strictEqual(p1.actions.length, 2);
assert.strictEqual(p1.actions[0].params.option, "B");
console.log("✓ Test 6: Standard <actions> tags parsed correctly");

// Test 7: parseAI with markdown code block
const markdownRaw = `Here is the solution:\n\`\`\`json\n[{"action":"select_radio","params":{"option":"C","text":"3"}},{"action":"click_next"}]\n\`\`\``;
const p2 = parseAI(markdownRaw);
assert.strictEqual(p2.actions.length, 2);
assert.strictEqual(p2.actions[0].params.option, "C");
console.log("✓ Test 7: Markdown code block JSON parsed correctly");

// Test 8: parseAI fallback to text conclusion
const textRaw = `After analyzing the problem, the correct answer is (B).`;
const p3 = parseAI(textRaw);
assert.strictEqual(p3.actions.length, 2);
assert.strictEqual(p3.actions[0].params.option, "B");
console.log("✓ Test 8: Text conclusion fallback to Option B parsed correctly");

console.log("\nALL 8 TESTS PASSED SUCCESSFULLY! 🎉");
