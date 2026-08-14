// The phone now PREDICTS ordinary plays using app/shared/engine.js, so that file
// disagreeing with netlify/functions/lib/engine.js stops being a tidiness
// problem and becomes a correctness one: the board would show a play the server
// then refuses. The two files are kept in sync by hand (`cp` after any edit),
// which is exactly the kind of step that gets forgotten.
//
// RULES_VERSION guards the deployed case — an old client meeting a new server
// sees a version it does not match and stops predicting. This guards the case
// RULES_VERSION cannot: someone edits one copy and forgets the other, so both
// halves ship claiming the same version while running different rules.
//
//   node scripts/test-engine-sync.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'app', 'shared', 'engine.js');
const B = path.join(ROOT, 'netlify', 'functions', 'lib', 'engine.js');

const a = fs.readFileSync(A, 'utf8');
const b = fs.readFileSync(B, 'utf8');

let failed = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failed++;
}

check('the two engine copies are byte-identical', a === b,
  a === b ? '' : 'run: cp app/shared/engine.js netlify/functions/lib/engine.js');

const version = require(A).RULES_VERSION;
check('the engine reports a RULES_VERSION', typeof version === 'string' && version.length > 0, version || '(missing)');

// The client compares this against what the server sends in the view; if the
// server ever stops sending it, prediction silently switches itself off, so a
// missing field is a real regression rather than a cosmetic one.
const views = fs.readFileSync(path.join(ROOT, 'netlify', 'functions', 'lib', 'views.js'), 'utf8');
check('views.js publishes engineRules to the client', /engineRules:\s*engine\.RULES_VERSION/.test(views));

console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL PASS');
process.exit(failed ? 1 : 0);
