import assert from 'node:assert/strict';
import { build } from 'esbuild';

const built = await build({ entryPoints: ['src/shared/format.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { formatDate } = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0]!.text).toString('base64')}`);

const options: Intl.DateTimeFormatOptions = {
  year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
};
const values = Array.from({ length: 1000 }, (_, index) => new Date(1700000000000 + index * 86400000).toISOString());
const start = performance.now();
const expected = values.map(value => new Intl.DateTimeFormat('ja-JP', options).format(new Date(value)));
const baselineMs = performance.now() - start;
const optimizedStart = performance.now();
const actual = values.map(formatDate);
const optimizedMs = performance.now() - optimizedStart;
assert.deepEqual(actual, expected, 'Reusing the formatter preserves all displayed dates');
assert.throws(() => formatDate('invalid'), RangeError);
console.log(`Date formatting, 1,000 groups: baseline ${baselineMs.toFixed(1)} ms; reused formatter ${optimizedMs.toFixed(1)} ms`);
