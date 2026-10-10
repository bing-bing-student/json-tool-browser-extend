import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import * as engine from '../src/components/utils/diffEngine.ts';
import { getAlignedDiffNavigationBounds, getDiffNavigationScrollTop, getVisibleDiffNavigationMarker } from '../src/components/utils/diffNavigation.ts';
import { getVisibleDiffViewZone } from '../src/components/utils/diffViewZoneGeometry.ts';

test('million-line alignment gaps fill the viewport past DOM pixel limits', () => {
    assert.deepEqual(getVisibleDiffViewZone(32, 17_600_000, 16_787_000, 800), { top: 0, height: 800 });
    assert.deepEqual(getVisibleDiffViewZone(16, 48_000_000, 32_000_000, 900), { top: 0, height: 900 });
});

test('alignment gap painting stops at its real end and preserves following content', () => {
    assert.deepEqual(getVisibleDiffViewZone(32, 17_600_000, 17_599_832, 800), { top: 0, height: 200 });
    assert.deepEqual(getVisibleDiffViewZone(32, 16, 0, 800), { top: 32, height: 16 });
    assert.deepEqual(getVisibleDiffViewZone(790, 32, 0, 800), { top: 790, height: 10 });
});

test('offscreen and hidden alignment gaps do not create a painted element', () => {
    assert.equal(getVisibleDiffViewZone(null, 48_000_000, 0, 800), null);
    assert.equal(getVisibleDiffViewZone(1000, 48_000_000, 0, 800), null);
    assert.equal(getVisibleDiffViewZone(0, 32, 32, 800), null);
    assert.equal(getVisibleDiffViewZone(0, 32, 0, 0), null);
});

test('navigation includes the leading alignment spacer and an empty original side', () => {
    assert.deepEqual(getAlignedDiffNavigationBounds({ top: 16, bottom: 48 }, { top: 0, bottom: 48 }), { top: 0, bottom: 48 });
    assert.deepEqual(getAlignedDiffNavigationBounds(null, { top: 64, bottom: 80 }), { top: 64, bottom: 80 });
    assert.deepEqual(getAlignedDiffNavigationBounds({ top: 64, bottom: 80 }, null), { top: 64, bottom: 80 });
    assert.equal(getAlignedDiffNavigationBounds(null, null), null);
});

test('navigation keeps visible short-document differences stationary', () => {
    assert.equal(getDiffNavigationScrollTop({ top: 0, bottom: 48 }, 0, 400, 16), null);
    assert.equal(getDiffNavigationScrollTop({ top: 64, bottom: 80 }, 0, 400, 16), null);
    assert.equal(getDiffNavigationScrollTop({ top: 1016, bottom: 1048 }, 900, 400, 16), null);
});

test('navigation centers differences outside the viewport', () => {
    assert.equal(getDiffNavigationScrollTop({ top: 1000, bottom: 1032 }, 0, 400, 16), 816);
    assert.equal(getDiffNavigationScrollTop({ top: 16, bottom: 48 }, 900, 400, 16), 0);
    assert.equal(getDiffNavigationScrollTop({ top: 0, bottom: 48 }, 0, 0, 16), null);
});

test('navigation uses the start of a block taller than the viewport', () => {
    assert.equal(getDiffNavigationScrollTop({ top: 16, bottom: 10000 }, 0, 400, 16), null);
    assert.equal(getDiffNavigationScrollTop({ top: 1000, bottom: 10000 }, 0, 400, 16), 808);
});

test('navigation markers are clipped to the visible editor instead of allocating a huge overlay', () => {
    assert.deepEqual(getVisibleDiffNavigationMarker({ top: 16, bottom: 1000000 }, 32, 400), { top: 0, height: 400 });
    assert.deepEqual(getVisibleDiffNavigationMarker({ top: 64, bottom: 80 }, 0, 400), { top: 64, height: 16 });
    assert.equal(getVisibleDiffNavigationMarker({ top: 1000, bottom: 1032 }, 0, 400), null);
    assert.equal(getVisibleDiffNavigationMarker({ top: 0, bottom: 32 }, 32, 400), null);
});

const singleLineChange = [{
    originalStartLineNumber: 1,
    originalEndLineNumber: 1,
    modifiedStartLineNumber: 1,
    modifiedEndLineNumber: 1,
}];

test('diff preserves whitespace changes inside JSON strings and keys', () => {
    const pairs = [
        ['{"name":"a b"}', '{"name":"a  b"}'],
        ['{"name":" a"}', '{"name":"  a"}'],
        ['{"name":"a "}', '{"name":"a  "}'],
        ['{"first name":1}', '{"first  name":1}'],
        ['" "', '"  "'],
        [JSON.stringify({ name: 'a b' }), JSON.stringify({ name: 'a\u00a0b' })],
    ];
    for (const [left, right] of pairs) {
        assert.deepEqual(engine.computeLineDiff([left], [right]), singleLineChange, `${left} versus ${right}`);
    }
});

test('diff preserves string boundaries around escaped quotes and backslashes', () => {
    const pairs = [
        [JSON.stringify({ name: 'a" b' }), JSON.stringify({ name: 'a"  b' })],
        [JSON.stringify({ name: 'a\\" b' }), JSON.stringify({ name: 'a\\"  b' })],
        [JSON.stringify({ path: 'C:\\', name: 'a b' }), JSON.stringify({ path: 'C:\\', name: 'a  b' })],
    ];
    for (const [left, right] of pairs) {
        assert.deepEqual(engine.computeLineDiff([left], [right]), singleLineChange);
    }
    assert.deepEqual(engine.computeLineDiff(
        [String.raw`{"path":"C:\\",  "name": "same"}`],
        [String.raw`{"path":"C:\\", "name": "same"}`],
    ), []);
});

test('diff keeps the existing normalization of whitespace outside strings', () => {
    assert.deepEqual(engine.computeLineDiff(
        ['{', '  "name":   "a  b",', '  "items": [1,   2]', '}'],
        ['\t{  ', '\t"name": "a  b",\t', '\t"items": [1, 2] ', ' }'],
    ), []);
    assert.deepEqual(engine.computeLineDiff(['\t  '], ['']), []);
});

test('diff handles JSON5 single quoted strings and escaped single quotes', () => {
    assert.deepEqual(engine.computeLineDiff(["{name:'a b'}"], ["{name:'a  b'}"]), singleLineChange);
    assert.deepEqual(engine.computeLineDiff(
        [String.raw`{name:'a\' b'}`],
        [String.raw`{name:'a\'  b'}`],
    ), singleLineChange);
});

test('comment quotes do not change string state on following JSON5 lines', () => {
    assert.deepEqual(engine.computeLineDiff(
        ['{', '// a "quote', '  "name": "same"', '}'],
        ['{', '// a "quote', '\t"name": "same"', '}'],
    ), []);
    assert.deepEqual(engine.computeLineDiff(
        ['{', '/* a "quote', '  inside comment */', '  "name": "same"', '}'],
        ['{', '/* a "quote', '\tinside comment */', '\t"name": "same"', '}'],
    ), []);
});

test('diff preserves whitespace in JSON5 line continued strings', () => {
    const left = ['{', "  name: 'a\\", " b'", '}'];
    const right = ['{', "  name: 'a\\", "  b'", '}'];
    assert.deepEqual(engine.computeLineDiff(left, right), [{
        originalStartLineNumber: 3,
        originalEndLineNumber: 3,
        modifiedStartLineNumber: 3,
        modifiedEndLineNumber: 3,
    }]);
    assert.deepEqual(engine.computeLineDiff(left, left), []);
});

test('diff detects whitespace while a string is still being edited', () => {
    assert.deepEqual(engine.computeLineDiff(['{"name":"a '], ['{"name":"a  ']), singleLineChange);
});

test('diff returns original line and column positions for an added string space', () => {
    const left = '{"name":"a b"}';
    const right = '{"name":"a  b"}';
    assert.deepEqual(engine.computeLineDiff(['{', `  ${left}`, '}'], ['{', `  ${right}`, '}']), [{
        originalStartLineNumber: 2,
        originalEndLineNumber: 2,
        modifiedStartLineNumber: 2,
        modifiedEndLineNumber: 2,
    }]);
    const inline = engine.computeInlineDiff(left, right);
    assert.deepEqual(inline.leftSegments, []);
    assert.equal(inline.rightSegments.length, 1);
    const segment = inline.rightSegments[0];
    assert.equal(right.slice(segment.startCol - 1, segment.endCol - 1), ' ');
});

test('repair comparison uses exact text, including malformed quotes and outside whitespace', () => {
    for (const [left, right] of [['  {"a":1}', '{"a":1}'], ['[1  2]', '[1 2]'], ['// hello  world', '// hello world'], ['{"name":"a  ', '{"name":"a ']]) {
        assert.deepEqual(engine.computeLineDiff([left], [right], { exact: true }), singleLineChange);
    }
});

const logLines = [
    '{"level":"ERROR","ts":"2026-07-31T00:58:06.523+0800","caller":"meta-api/app/handler/admin/admin.go","msg":"refreshToken failed","error":"invalid token use"}',
    '{"level":"ERROR","ts":"2026-10-08T07:06:18.114+0800","caller":"meta-api/app/handler/userauth/userauth.go","msg":"oauth callback failed","error":"user auth failed"}',
];
const workerBundle = await build({ entryPoints: ['src/components/workers/jsonRepairDiff.worker.ts'], bundle: true, write: false, format: 'iife', platform: 'browser' });
function repairDiffWorker() {
    const messages = [], self = { postMessage(message) { messages.push(message); } };
    runInNewContext(workerBundle.outputFiles[0].text, { self });
    return data => { self.onmessage({ data }); return JSON.parse(JSON.stringify(messages.at(-1))); };
}

test('repair Diff worker aligns NDJSON with added array brackets and highlights only the added comma', () => {
    const send = repairDiffWorker();
    const right = ['[', logLines[0] + ',', logLines[1], ']'];
    const { changes, navigationChanges } = send({ type: 'compare', left: logLines, right });
    assert.equal(changes.length, 3);
    assert.equal(navigationChanges.length, 2, 'alignment must not inflate the number of contiguous differences');
    assert.deepEqual(navigationChanges, engine.computeLineDiff(logLines, right, { exact: true }));
    assert.deepEqual(changes[1], { originalStartLineNumber: 1, originalEndLineNumber: 1, modifiedStartLineNumber: 2, modifiedEndLineNumber: 2 });
    const { inline, requestId } = send({ type: 'inline', start: 2, end: 3, requestId: 42 });
    assert.equal(requestId, 42);
    assert.equal(inline.length, 1);
    assert.equal(inline[0].changeIndex, 0, 'comma belongs to the first navigation block along with the opening bracket');
    assert.equal(inline[0].leftLine, 1);
    assert.equal(inline[0].rightLine, 2);
    assert.deepEqual(inline[0].leftSegments, []);
    assert.deepEqual(inline[0].rightSegments, [{ startCol: logLines[0].length + 1, endCol: logLines[0].length + 2 }]);
    assert.equal(right[1].slice(inline[0].rightSegments[0].startCol - 1, inline[0].rightSegments[0].endCol - 1), ',');
    assert.deepEqual(send({ type: 'inline', start: 3, end: 4, requestId: 43 }).inline, []);
});

test('repair pairing handles removed leading text and preserves unrelated replacements as a block', () => {
    const left = ['test', logLines[0]], right = [logLines[0] + ','];
    const refined = engine.refineRepairLineChanges(left, right, engine.computeLineDiff(left, right, { exact: true }));
    assert.equal(refined.length, 2);
    assert.equal(refined[0].modifiedEndLineNumber, 0);
    assert.deepEqual(refined[1], { originalStartLineNumber: 2, originalEndLineNumber: 2, modifiedStartLineNumber: 1, modifiedEndLineNumber: 1 });
    const unrelatedLeft = ['alpha', 'bravo'], unrelatedRight = ['delta', 'echo', 'foxtrot'];
    const changes = engine.computeLineDiff(unrelatedLeft, unrelatedRight, { exact: true });
    assert.deepEqual(engine.refineRepairLineChanges(unrelatedLeft, unrelatedRight, changes), changes);
});

test('inline markers retain their parent navigation block across multiple aligned differences', () => {
    const left = ['{"a":1}', '{"unchanged":true}', '{"b":2}'];
    const right = ['[', left[0] + ',', left[1], left[2] + ',', ']'];
    const send = repairDiffWorker();
    const comparison = send({ type: 'compare', left, right });
    assert.equal(comparison.navigationChanges.length, 2);
    const { inline } = send({ type: 'inline', start: 1, end: right.length, requestId: 1 });
    assert.deepEqual(inline.map(row => [row.rightLine, row.changeIndex]), [[2, 0], [4, 1]]);
    assert.deepEqual(inline.map(row => right[row.rightLine - 1].slice(row.rightSegments[0].startCol - 1, row.rightSegments[0].endCol - 1)), [',', ',']);
    assert.deepEqual(send({ type: 'compare', left, right: left }).navigationChanges, []);
    assert.deepEqual(send({ type: 'inline', start: 1, end: left.length, requestId: 2 }).inline, []);
});

test('refined repair blocks still reconstruct all modified text without mutating the input changes', () => {
    for (let size = 1; size <= 30; size++) {
        const left = Array.from({ length: size }, (_, id) => JSON.stringify({ id, message: `message-${id}`, emoji: '🙂' }));
        const right = ['[', ...left.filter((_, i) => i % 5 !== 3).map((line, i) => '  ' + line.replace('message-', i % 4 ? 'message-' : 'repaired-') + ','), ']'];
        const changes = engine.computeLineDiff(left, right, { exact: true });
        const before = structuredClone(changes);
        const refined = engine.refineRepairLineChanges(left, right, changes);
        const reconstructed = [], previous = { left: 0, right: 0 };
        for (const change of refined) {
            const leftStart = change.originalStartLineNumber - 1, rightStart = change.modifiedStartLineNumber - 1;
            assert(leftStart >= previous.left && rightStart >= previous.right);
            assert.deepEqual(left.slice(previous.left, leftStart), right.slice(previous.right, rightStart));
            reconstructed.push(...left.slice(previous.left, leftStart), ...right.slice(rightStart, change.modifiedEndLineNumber));
            previous.left = change.originalEndLineNumber; previous.right = change.modifiedEndLineNumber;
        }
        reconstructed.push(...left.slice(previous.left));
        assert.deepEqual(reconstructed, right);
        assert.deepEqual(changes, before);
    }
});

test('million-character lines retain precise inline markers for commas and Unicode replacements', () => {
    const line = JSON.stringify({ message: 'x'.repeat(1_000_000), emoji: '🙂' });
    assert.deepEqual(engine.computeInlineDiff(line, line + ',').rightSegments, [{ startCol: line.length + 1, endCol: line.length + 2 }]);
    const right = line.replace('🙂', '🚀');
    const inline = engine.computeInlineDiff(line, right);
    assert(!inline.tooLarge);
    const segment = inline.rightSegments[0];
    assert.equal(right.slice(segment.startCol - 1, segment.endCol - 1), '🚀');
});

test('complex inline differences fall back to a bounded changed window', () => {
    for (const length of [6000, 20000]) {
        const left = 'prefix:' + 'a'.repeat(length) + ':suffix', right = 'prefix:' + 'b'.repeat(length) + ':suffix';
        const inline = engine.computeInlineDiff(left, right);
        assert(inline.tooLarge);
        assert.deepEqual(inline.leftSegments, [{ startCol: 8, endCol: length + 8 }]);
        assert.deepEqual(inline.rightSegments, [{ startCol: 8, endCol: length + 8 }]);
    }
});

test('large NDJSON uses paired blocks and computes inline markers only in the requested viewport', () => {
    const left = Array.from({ length: 10000 }, (_, id) => JSON.stringify({ id, message: `message-${id}` }));
    const right = ['[', ...left.map((line, i) => line + (i < left.length - 1 ? ',' : '')), ']'];
    const send = repairDiffWorker();
    const result = send({ type: 'compare', left, right });
    assert.equal(result.type, 'changes');
    assert.equal(result.changes.length, 3);
    assert.equal(result.navigationChanges.length, 2);
    const { inline } = send({ type: 'inline', start: 5000, end: 5010, requestId: 1 });
    assert.equal(inline.length, 11);
    for (const row of inline) {
        assert.equal(row.changeIndex, 0);
        assert.equal(row.rightLine - row.leftLine, 1);
        assert.equal(row.rightSegments.length, 1);
        const segment = row.rightSegments[0];
        assert.equal(right[row.rightLine - 1].slice(segment.startCol - 1, segment.endCol - 1), ',');
    }
});
