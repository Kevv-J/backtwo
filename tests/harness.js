// Golden test harness for backtwo's damage calc.
//
// Loads viewer_template.html into a Node VM sandbox with a stubbed DOM, then
// exposes calcDmg / effectiveBP / newSide / newField / etc. as ESM exports.
// The calc code is pure — reads globals A, B, sideA, sideB, weather, field,
// DEX — so no browser is needed and cold-start is <2s.
//
// Any inline event wiring is swallowed by the document stub; if a load-time
// script throws, the harness prints the offending script index and fails.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');

const html = readFileSync(resolve(ROOT, 'viewer_template.html'), 'utf8');
// Extract every inline <script> body (skip src= scripts — GoatCounter loader).
// The main app script is the largest; a couple of tiny pre-scripts also inline.
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);

// Inject the built dex.json as a string so the calc's `DEX = /*__DEX__*/null`
// placeholder resolves to real data. The build pipeline does this substitution
// in viewer_template.html → index.html; we do it in the sandbox instead.
const dexJson = readFileSync(resolve(ROOT, 'data/dex.json'), 'utf8');
const teamsJson = readFileSync(resolve(ROOT, 'data/teams.json'), 'utf8');

// Stub DOM — the calc engine itself never touches document, but the file's
// bottom-of-page wiring (event handlers, view registration) will crash without
// these. The stubs no-op everything.
const stubDoc = `
// window is a Proxy so any load-time wiring (addEventListener('scroll',...),
// matchMedia, requestAnimationFrame, etc.) resolves to a no-op function.
var window = new Proxy(globalThis, {
  get(target, k) {
    if (k in target) return target[k];
    return () => {};
  },
});
// Any DOM lookup returns a Proxy-based null-object: any method call is a no-op,
// any nested access recursively returns another null-object. Handles arbitrary
// chained access like document.body.insertAdjacentHTML(...).
function nullObj() {
  return new Proxy(function () {}, {
    get(t, k) {
      if (k === 'length') return 0;
      if (k === Symbol.iterator) return function* () {};
      if (k === Symbol.toPrimitive) return () => '';
      return nullObj();
    },
    apply: () => nullObj(),
    construct: () => nullObj(),
  });
}
var document = new Proxy({}, {
  get(_, k) {
    // Return an assignable no-op object so code like elt.onclick=fn doesn't
    // throw. querySelectorAll must be iterable, so give it an empty array.
    if (k === 'querySelector' || k === 'getElementById') return () => nullObj();
    if (k === 'querySelectorAll') return () => [];
    if (k === 'title') return '';
    if (k === 'visibilityState') return 'visible';
    if (k === 'referrer' || k === 'URL' || k === 'baseURI' || k === 'cookie') return '';
    if (k === 'location') return { hash:'', search:'', href:'', origin:'', pathname:'/' };
    return nullObj();
  },
});
var localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
var matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
var performance = { now: () => 0, getEntriesByType: () => [] };
var navigator = { userAgent: 'node', clipboard: null };
var location = { hash:'', search:'', href:'', origin:'', pathname:'/' };
var history = { pushState() {}, replaceState() {} };
var setTimeout = (fn) => { try { fn && fn(); } catch (_) {} return 0; };
var clearTimeout = () => {};
var setInterval = () => 0;
var clearInterval = () => {};
var requestAnimationFrame = (fn) => { fn && fn(0); return 0; };
var cancelAnimationFrame = () => {};
var ResizeObserver = class { observe() {} disconnect() {} };
var MutationObserver = class { observe() {} disconnect() {} };
var IntersectionObserver = class { observe() {} disconnect() {} };
// Bare (unqualified) DOM globals — a browser resolves these to window.* but
// a VM context doesn't auto-bridge. Stub top-level to no-ops.
var addEventListener = () => {};
var removeEventListener = () => {};
var innerWidth = 1200, innerHeight = 900;
var screen = { width: 1200, height: 900 };
`;

const ctx = vm.createContext({ console });
// Expose an in-sandbox setState that closes over the calc's real let-bindings
// (weather, field, A, B, sideA, sideB). Outer ctx.weather = X wouldn't work
// because let-declared bindings aren't properties of the global object.
const setStateInjection = `
globalThis.__setState = function(atk, def, sa, sb, w, f) {
  A = atk; B = def; sideA = sa; sideB = sb; weather = w; field = f;
};
globalThis.__exportCalc = { calcDmg, effectiveBP, statsOf, pokeRound,
  chainMod, applyMod, M, FP_ONE, newSide, newField, newMon, DEX, parseShowdown,
  calcSummary, jsForme, normSpec, PSYSHOCK_MOVES };
`;
const combined = stubDoc
  + scripts.map((body, i) =>
      body
        // Data substitutions the build pipeline normally does in index.html
        .replace('/*__DATA__*/null', teamsJson)
        .replace('/*__DEX__*/null', dexJson)
        .replace(/\/\*__BUILD_STAMP__\*\/[^,]*/g, '""')
    ).join('\n;\n')
  + '\n;\n' + setStateInjection;

try {
  vm.runInContext(combined, ctx, { filename: 'viewer_template.html' });
} catch (e) {
  console.error('harness: failed to load viewer_template.html');
  console.error(e);
  process.exit(1);
}

// Expose calc + state-setter + fixtures (pulled from the in-sandbox setter
// so the let-bindings are the real ones the calc engine reads).
const _exp = ctx.__exportCalc;
export const {
  calcDmg, effectiveBP, statsOf, pokeRound, chainMod, applyMod, M, FP_ONE,
  newSide, newField, newMon, DEX, parseShowdown,
  calcSummary, jsForme, normSpec, PSYSHOCK_MOVES,
} = _exp;

export function setState({ atk, def, sA, sB, w, f }) {
  ctx.__setState(atk, def, sA, sB, w, f);
}

// Convenience: run calcDmg with a state block so tests read as one line.
export function calc({ atk, def, sA, sB, w, f, move }) {
  setState({ atk, def, sA, sB, w, f });
  return _exp.calcDmg(atk, move, def, sA, sB);
}
