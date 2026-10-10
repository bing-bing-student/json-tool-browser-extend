import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';
import * as vue from 'vue';

const bundle = (contents, plugins = []) => build({
    stdin: { contents, resolveDir: process.cwd() },
    bundle: true, platform: 'node', format: 'cjs', write: false, plugins, external: ['vue'],
});
const pureBundle = await bundle(`
    export * from './src/components/utils/jsonLevelAnalysis';
    export { parseJsonInput } from './src/components/utils/jsonEngine/service';
    export { calculateMaxLevel } from './src/components/utils/jsonStructure';`);
const pureModule = { exports: {} };
runInNewContext(pureBundle.outputFiles[0].text, { module: pureModule, exports: pureModule.exports, TextDecoder, TextEncoder });
const api = pureModule.exports;
const opts = { indentSize: 2, arrayNewLine: true, preserveNumberLiterals: true, encodingMode: false };

test('analysis scheduling covers medium byte counts and many short lines before native large-file thresholds', () => {
    for (const [chars, lines, worker, delay, mode] of [
        [0, 1, false, 150, 'compatible'],
        [512 * 1024 - 1, 9999, false, 150, 'compatible'],
        [512 * 1024, 1, true, 800, 'compatible'],
        [100, 10000, true, 800, 'compatible'],
        [7620443, 172057, true, 800, 'compatible'],
        [10 * 1024 * 1024, 300000, true, 800, 'compatible'],
        [10 * 1024 * 1024 + 1, 300000, true, 800, 'structural'],
    ]) {
        const plan = api.getJsonLevelAnalysisPlan(chars, lines);
        assert.equal(plan.useWorker, worker); assert.equal(plan.delay, delay); assert.equal(plan.mode, mode);
    }
});

test('background compatible analysis matches existing parser options, recursive JSON strings and extensions', () => {
    const samples = [
        '{"nested":{"values":[{},1]}}',
        "{key: 'value', absent: undefined, special: NaN, hex: 0xFF, list:[1,2,],}",
        '# comment {\n{a:{b:[{},{}]}, /* [ */ text: "braces } ["}',
        String.raw`{"id":900719925474099312345,"float":1.2300,"text":"\u4e2d\u6587","other":"\x41"}`,
        JSON.stringify(JSON.stringify('{"a":{"b":[{}]}}')),
        '\u0000{"a":[{"b":1}]}\u0007',
        '[]', '{}', 'null', 'true', '123', '"a } { string"',
    ];
    for (const preserveNumberLiterals of [false, true]) for (const encodingMode of [false, true]) {
        const options = { ...opts, preserveNumberLiterals, encodingMode };
        for (const input of samples) {
            const expected = api.calculateMaxLevel(api.parseJsonInput(api.cleanJsonLevelAnalysisInput(input), options).data);
            assert.equal(api.analyzeJsonLevelInput(input, 'compatible', options), expected, input);
        }
    }
});

test('compatible mode still rejects balanced but invalid JSON, while existing huge-input scanner stays unchanged', () => {
    for (const input of ['{"a":}', '{"a":1 "b":2}', '{', '{"a":"unterminated}']) {
        assert.throws(() => api.analyzeJsonLevelInput(input, 'compatible', opts));
    }
    assert.equal(api.analyzeJsonLevelInput('{"a":}', 'structural', opts), 1);
    assert.equal(api.analyzeJsonLevelInput('# {}\n{a:[{text:"}["}], /* { [ */ b: true}', 'structural'), 3);
    for (const input of ['}', '{', '{"a":"unterminated}', '/* never ends']) {
        assert.throws(() => api.analyzeJsonLevelInput(input, 'structural'));
    }
});

const schedulerBundle = await bundle(`export { useJsonLevelAnalysis } from './src/components/composables/useJsonLevelAnalysis';`, [{
    name: 'test-worker', setup(build) {
        build.onResolve({ filter: /jsonLevelAnalysis\.worker\?worker$/ }, () => ({ path: 'worker', namespace: 'test-worker' }));
        build.onLoad({ filter: /.*/, namespace: 'test-worker' }, () => ({ contents: 'export default TestLevelWorker;', loader: 'js' }));
    },
}]);

const fixture = ({ chars = 7620443, lines = 172057, value = '{"a":{"b":[1]}}' } = {}) => {
    let clock = 0, handle = 0, current;
    const timers = new Map(), workers = [];
    const calls = { inline: 0, reads: 0, inputClears: 0, outputClears: 0, warnings: 0, foldingClears: 0 };
    const workerControl = { throwCreate: false, throwPost: false };
    const window = {
        setTimeout(fn, delay) { const id = ++handle; timers.set(id, { fn, due: clock + delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
    };
    const advance = (ms) => {
        const target = clock + ms;
        for (;;) {
            const next = [...timers.entries()].filter(([, task]) => task.due <= target).sort((a, b) => a[1].due - b[1].due)[0];
            if (!next) break;
            clock = next[1].due; timers.delete(next[0]); next[1].fn();
        }
        clock = target;
    };
    const makeModel = (text = value, count = lines, size = chars) => ({
        version: 1, disposed: false, text,
        isDisposed() { return this.disposed; }, getVersionId() { return this.version; },
        getLineCount() { return count; }, getValueLength() { return size; },
        getLineContent(line) { return this.text.split('\n')[line - 1] ?? ''; },
        getValue() { calls.reads++; return this.text; },
        getFullModelRange() { return { isEmpty: () => false }; },
    });
    current = makeModel();
    class TestLevelWorker {
        constructor() { if (workerControl.throwCreate) throw new Error('worker unavailable'); this.messages = []; this.terminated = false; workers.push(this); }
        postMessage(message) { if (workerControl.throwPost) throw new Error('clone failed'); this.messages.push(structuredClone(message)); }
        terminate() { this.terminated = true; }
        reply(level = 3, id = this.messages.at(-1).id, error) { this.onmessage?.({ data: { id, level, error } }); }
    }
    const module = { exports: {} };
    runInNewContext(schedulerBundle.outputFiles[0].text, { module, exports: module.exports, window, TestLevelWorker, TextDecoder, TextEncoder,
        require: (name) => { assert.equal(name, 'vue'); return vue; } });
    const maxLevel = { value: 2 }, selectedLevel = { value: 2 }, language = { value: 'json' };
    let parserOptions = { ...opts };
    const editor = { getModel: () => current, executeEdits() { calls.inputClears++; current.version++; } };
    const analysis = module.exports.useJsonLevelAnalysis({
        maxLevel, selectedLevel, inputContentLanguage: language,
        getInputEditor: () => editor, getOutputEditor: () => ({}),
        updateInputEditorConfig: (value) => { language.value = value; },
        preprocessJson(input) { calls.inline++; return api.parseJsonInput(input, parserOptions).data; },
        getParserOptions: () => parserOptions,
        resetPrecomputedFoldingInfo() {}, clearOutputFoldingInfo() { calls.foldingClears++; },
        clearOutputEditor() { calls.outputClears++; }, showDepthLimitError() { calls.warnings++; },
    });
    const change = () => { current.version++; analysis.scheduleInputLevelAnalysis(true); };
    return { analysis, advance, change, workers, calls, workerControl, maxLevel, selectedLevel, language, timers,
        model: () => current, replaceModel: (...args) => (current = makeModel(...args)),
        setOptions: (value) => (parserOptions = value) };
};

test('five consecutive Enter changes read no full text and perform no parse until one idle worker dispatch', () => {
    const f = fixture();
    for (let i = 0; i < 5; i++) { f.change(); f.advance(100); }
    assert.equal(f.calls.reads, 0); assert.equal(f.calls.inline, 0); assert.equal(f.workers.length, 0);
    f.advance(699); assert.equal(f.workers.length, 0);
    f.advance(1); assert.equal(f.workers.length, 1); assert.equal(f.calls.reads, 1);
    assert.equal(f.calls.inline, 0); assert.equal(f.workers[0].messages.length, 1);
    assert.equal(f.workers[0].messages[0].mode, 'compatible');
    f.workers[0].reply(12); assert.equal(f.maxLevel.value, 12);
});

test('many short lines and one long medium line both dispatch background compatible parsing', () => {
    for (const params of [{ chars: 100000, lines: 12000 }, { chars: 600000, lines: 1 }]) {
        const f = fixture(params); f.change(); f.advance(800);
        assert.equal(f.calls.inline, 0); assert.equal(f.workers[0].messages[0].mode, 'compatible');
    }
});

test('small files use short debounce and preserve the existing inline parser and default folding level', () => {
    const f = fixture({ chars: 20, lines: 1 });
    f.selectedLevel.value = 0;
    f.change(); f.advance(100); f.change(); f.advance(149);
    assert.equal(f.calls.reads, 0); f.advance(1);
    assert.equal(f.calls.inline, 1); assert.equal(f.maxLevel.value, 3);
    assert.equal(f.selectedLevel.value, 2); assert.equal(f.workers.length, 0);
});

test('new edits terminate stale worker and ignore its success, errors and late failure notifications', () => {
    const f = fixture(); f.change(); f.advance(800); const old = f.workers[0];
    f.change(); assert.equal(old.terminated, true);
    old.reply(100); old.reply(undefined, old.messages[0].id, 'bad JSON'); old.onerror?.();
    assert.equal(f.maxLevel.value, 2); assert.equal(f.calls.warnings, 0);
    f.advance(800); const next = f.workers[1]; next.reply(12);
    assert.equal(f.maxLevel.value, 12);
});

test('model identity and version reject stale timers or worker responses even without another schedule call', () => {
    for (const swap of [true, false]) {
        const f = fixture(); f.change(); if (swap) f.replaceModel(); else f.model().version++;
        f.advance(800); assert.equal(f.calls.reads, 0);
        f.change(); f.advance(800); const worker = f.workers[0];
        if (swap) f.replaceModel(); else f.model().version++;
        worker.reply(100); worker.reply(undefined, worker.messages[0].id, 'invalid');
        assert.equal(f.maxLevel.value, 2); assert.equal(f.calls.warnings, 0);
        f.advance(100); assert.equal(f.calls.inputClears, 0);
    }
});

test('worker receives the current parser settings as a snapshot and unrelated request ids cannot apply', () => {
    const f = fixture(); const options = { ...opts, encodingMode: true, preserveNumberLiterals: false };
    f.setOptions(options); f.change(); f.advance(800); const worker = f.workers[0];
    options.encodingMode = false;
    assert.equal(worker.messages[0].options.encodingMode, true);
    assert.equal(worker.messages[0].options.preserveNumberLiterals, false);
    worker.reply(99, worker.messages[0].id - 1); assert.equal(f.maxLevel.value, 2);
    worker.reply(12); assert.equal(f.maxLevel.value, 12);
});

test('parse errors reset levels without clearing content; worker failures can recover on the next edit', () => {
    for (const failure of ['reply', 'onerror', 'onmessageerror', 'create', 'post']) {
        const f = fixture();
        f.workerControl.throwCreate = failure === 'create'; f.workerControl.throwPost = failure === 'post';
        f.change(); f.advance(800);
        const worker = f.workers[0];
        if (failure === 'reply') worker.reply(undefined, worker.messages[0].id, 'parse error');
        if (failure === 'onerror' || failure === 'onmessageerror') worker[failure]?.();
        assert.equal(f.maxLevel.value, 0, failure); assert.equal(f.calls.inline, 0);
        assert.equal(f.calls.inputClears, 0); assert.equal(f.calls.outputClears, 0);
        f.workerControl.throwCreate = false; f.workerControl.throwPost = false;
        f.change(); f.advance(800); f.workers.at(-1).reply(12);
        assert.equal(f.maxLevel.value, 12, failure);
    }
});

test('delayed depth-limit clearing cannot clear a newly edited or replaced model', () => {
    for (const replacement of [true, false]) {
        const f = fixture(); f.change(); f.advance(800); f.workers[0].reply(100);
        assert.equal(f.calls.warnings, 1);
        if (replacement) f.replaceModel(); else f.model().version++;
        f.advance(100); assert.equal(f.calls.inputClears, 0); assert.equal(f.calls.outputClears, 0);
    }
    const f = fixture(); f.change(); f.advance(800); f.workers[0].reply(100); f.advance(100);
    assert.equal(f.calls.inputClears, 1); assert.equal(f.calls.outputClears, 1);
});

test('clear, non-JSON input, cancellation and disposal stop pending work', () => {
    const f = fixture(); f.change(); f.analysis.scheduleInputLevelAnalysis(false); f.advance(800);
    assert.equal(f.workers.length, 0); assert.equal(f.maxLevel.value, 0); assert.equal(f.calls.outputClears, 1);
    const yaml = fixture({ value: 'items:\n  - value' }); yaml.change(); yaml.advance(800);
    assert.equal(yaml.language.value, 'yaml'); assert.equal(yaml.workers.length, 0); assert.equal(yaml.calls.reads, 0);
    const disposed = fixture(); disposed.change(); disposed.advance(800); const old = disposed.workers[0];
    disposed.analysis.destroyLevelAnalysisWorker(); old.reply(100); disposed.change(); disposed.advance(800);
    assert.equal(disposed.workers.length, 1); assert.equal(disposed.calls.warnings, 0); assert.equal(old.terminated, true);
});

const workerBundle = await bundle(`import './src/components/workers/jsonLevelAnalysis.worker';`);
test('actual worker responds with compatible depth, original huge-file scan and parser errors', () => {
    const responses = []; const self = { postMessage: (value) => responses.push(value) };
    runInNewContext(workerBundle.outputFiles[0].text, { self, TextDecoder, TextEncoder });
    for (const [id, input, mode, expected] of [[1, '{"a":[{}]}', 'compatible', 3], [2, '{"a":}', 'compatible', null], [3, '{"a":}', 'structural', 1]]) {
        self.onmessage({ data: { id, input, mode, options: opts } });
        assert.equal(responses.at(-1).id, id);
        if (expected === null) assert.ok(responses.at(-1).error); else assert.equal(responses.at(-1).level, expected);
    }
});
