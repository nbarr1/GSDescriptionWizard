// Generates the regression benchmark table in the README.
//
// For every fixture, reports the completeness score and whether each of the six
// deficiency categories from the 656-record analysis is addressed in the composed
// output, or explicitly recorded as a justified gap. Run: npm run benchmark

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const { scenarios, buildSession } = await import(join(root, 'tests/fixtures/scenarios.ts'));
const { compose } = await import(join(root, 'src/composer/index.ts'));
const { scoreSession } = await import(join(root, 'src/validation/scoring.ts'));

const BASELINE = {
  rootCause: { label: 'Root cause / why it happened', missing: 90.7 },
  equipment: { label: 'Equipment, tool or material', missing: 87.3 },
  immediateActions: { label: 'Immediate actions / treatment', missing: 82.0 },
  procedure: { label: 'Procedure or process followed', missing: 77.6 },
  activity: { label: 'Specific activity performed', missing: 73.5 },
  sequence: { label: 'Sequence context', missing: 68.6 },
};
const ORDER = Object.keys(BASELINE);

const rows = [];
const coverage = Object.fromEntries(ORDER.map((k) => [k, 0]));

for (const scenario of scenarios) {
  const session = buildSession(scenario);
  const report = scoreSession(session);
  const composed = compose(session);

  const cells = ORDER.map((category) => {
    const entry = report.categories.find((c) => c.category === category);
    const status = entry?.status ?? 'missing';
    const stated = composed.unaddressedCategories.includes(category);
    if (status === 'satisfied') {
      coverage[category] += 1;
      return 'covered';
    }
    if (status === 'thin') {
      coverage[category] += 1;
      return 'partial';
    }
    return stated ? 'gap stated' : 'missing';
  });

  rows.push({
    id: scenario.id,
    title: scenario.title,
    score: report.score,
    label: report.label,
    chars: composed.characterCount,
    cells,
  });
}

const pct = (n) => ((n / scenarios.length) * 100).toFixed(1);

let md = '';
md += '| Scenario | Score | Band | Chars | ' + ORDER.map((k) => shortLabel(k)).join(' | ') + ' |\n';
md += '|---|---|---|---|' + ORDER.map(() => '---').join('|') + '|\n';
for (const row of rows) {
  md += `| ${row.title} | ${row.score} | ${row.label} | ${row.chars} | ${row.cells.join(' | ')} |\n`;
}

md += '\n';
md +=
  '| Deficiency category | Missing in the 656 baseline records | Addressed across the 12 fixtures |\n';
md += '|---|---|---|\n';
for (const key of ORDER) {
  md += `| ${BASELINE[key].label} | ${BASELINE[key].missing}% | ${pct(coverage[key])}% |\n`;
}

const marker = { start: '<!-- BENCHMARK:START -->', end: '<!-- BENCHMARK:END -->' };
const readmePath = join(root, 'README.md');

if (existsSync(readmePath)) {
  const readme = readFileSync(readmePath, 'utf8');
  const startIndex = readme.indexOf(marker.start);
  const endIndex = readme.indexOf(marker.end);
  if (startIndex !== -1 && endIndex !== -1) {
    const next =
      readme.slice(0, startIndex + marker.start.length) +
      '\n\n' +
      md +
      '\n' +
      readme.slice(endIndex);
    writeFileSync(readmePath, next, 'utf8');
    console.log('Benchmark table written into README.md');
  } else {
    console.log(md);
  }
} else {
  console.log(md);
}

function shortLabel(key) {
  return {
    rootCause: 'Root cause',
    equipment: 'Equipment',
    immediateActions: 'Immediate actions',
    procedure: 'Procedure',
    activity: 'Activity',
    sequence: 'Sequence',
  }[key];
}
