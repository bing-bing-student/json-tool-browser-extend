import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
async function bundle(path) {
    const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node' });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { formatWithOptionalRepair, normalizeRepairValues } = await bundle('src/components/utils/jsonRepair.ts');
const { formatJsonInput } = await bundle('src/components/utils/jsonEngine/service.ts');
const { findStringBoundaryRepair, insertMissingObjectCommas } = await bundle('src/components/utils/repairStringBoundaries.ts');
const { selectRepairRoots } = await bundle('src/components/utils/repairRoots.ts');
const { JsonPlusFormatter } = await bundle('src/components/utils/jsonEngine/formatter.ts');
const { jsonrepair } = await import('jsonrepair');
const { startFormatTask } = await bundle('src/components/utils/formatWorkerClient.ts');
const opts = { indentSize: 2, arrayNewLine: true, preserveNumberLiterals: true, encodingMode: false };
const fixtures = JSON.parse(await readFile(new URL('./fixtures/jsonRepairCases.json', import.meta.url)));
for (const sample of fixtures.filter(x => x.expected != null)) {
    test(`repair compatibility: ${sample.name}`, async () => {
        const result = await formatWithOptionalRepair(sample.input, opts, true);
        assert.notEqual(result.repaired, undefined);
        assert.doesNotThrow(() => JSON.parse(result.repaired));
        assert.equal(result.formatted, formatJsonInput(sample.expected, opts).formatted);
    });
}
test('normal compatible formatting takes priority and never triggers repair', async () => {
    for (const input of ['{"ok":1}', "{a:'text', b:undefined, c:NaN, d:0xFF, e:+99,}", String.raw`{"raw":"\uXX"}`]) {
        const stages = [];
        const result = await formatWithOptionalRepair(input, opts, true, x => stages.push(x));
        assert.equal(result.repaired, undefined);
        assert.equal(result.formatted, formatJsonInput(input, opts).formatted);
        assert(!stages.includes('repairing'));
    }
});
test('repair disabled preserves parse failure', async () => {
    await assert.rejects(formatWithOptionalRepair('{"a":1 "b":2}', opts, false), { name: 'JsonInputParseError' });
    await assert.rejects(formatWithOptionalRepair('test\n{"a":1}', opts, false), { name: 'JsonInputParseError' });
});
test('valid root strings and strings inside valid arrays retain normal formatting priority', async () => {
    for (const input of ['"test"', "'test'", '["test",{"a":1},"end"]']) {
        const stages = [];
        const result = await formatWithOptionalRepair(input, opts, true, stage => stages.push(stage));
        assert.equal(result.repaired, undefined);
        assert.equal(result.formatted, formatJsonInput(input, opts).formatted);
        assert(!stages.includes('repairing'));
    }
});
test('malformed quotes cannot silently cut off subsequent fields as surrounding text', async () => {
    for (const input of ['{"text":"say "}" now" "n":1}', 'test\n{"text":"say "}" now" "n":1}\nend']) {
        await assert.rejects(formatWithOptionalRepair(input, opts, true));
    }
});
test('missing category closing quote preserves the original order hierarchy and every field', async () => {
    const input = await readFile(new URL('./fixtures/jsonRepairMissingCategoryQuote.json', import.meta.url), 'utf8');
    const expectedInput = input.replace('"category": "数码\n', '"category": "数码"\n');
    const expected = JSON.parse(expectedInput);
    for (const [name, broken] of [
        ['LF', input],
        ['CRLF', input.replaceAll('\n', '\r\n')],
        ['blank lines', input.replace('"category": "数码\n', '"category": "数码\n\n        \n')],
    ]) {
        const result = await formatWithOptionalRepair(broken, opts, true);
        assert.notEqual(result.repaired, undefined, name);
        assert.equal(result.repaired, broken.replace('"category": "数码', '"category": "数码"'), name);
        assert.equal(result.formatted, formatJsonInput(expectedInput, opts).formatted, name);
        const data = JSON.parse(result.formatted);
        assert.deepEqual(data, expected, name);
        assert.equal(data.orders[0].items[0].category, '数码', name);
        assert.deepEqual(data.orders[0].amount, { goods: 1, freight: 0, discount: 2, payable: -1 }, name);
        assert.equal(data.orders[0].remark, '工作日送', name);
        assert.deepEqual(data.orders[0].tags, ['首单'], name);
        assert(!Object.hasOwn(data.orders[0].items[0], 'amount'), name);
    }
});
test('missing category quote combined with one, two or many object commas preserves every order field', async () => {
    const input = await readFile(new URL('./fixtures/jsonRepairMissingCategoryQuote.json', import.meta.url), 'utf8');
    const expectedInput = input.replace('"category": "数码\n', '"category": "数码"\n');
    const expected = JSON.parse(expectedInput);
    const omissions = [
        ['title comma', ['"title": "JM键盘",']],
        ['two commas', ['"title": "JM键盘",', '"qty": 1,']],
        ['many commas including completed arrays and objects', [
            '"title": "JM键盘",', '"qty": 1,', '"price": 1,', '"createdAt": "2024-01-01",',
            '      ],\n      "amount":', '      },\n      "remark":', '"remark": "工作日送",',
        ]],
    ];
    for (const [name, fragments] of omissions) {
        let broken = input;
        for (const fragment of fragments) {
            assert(broken.includes(fragment), `fixture contains ${fragment}`);
            broken = broken.replace(fragment, fragment.replace(',', ''));
        }
        for (const newline of ['LF', 'CRLF']) {
            const sample = newline === 'CRLF' ? broken.replaceAll('\n', '\r\n') : broken;
            const label = `${name}, ${newline}`;
            const result = await formatWithOptionalRepair(sample, opts, true);
            assert.notEqual(result.repaired, undefined, label);
            assert.deepEqual(JSON.parse(result.repaired), expected, label);
            assert.equal(result.formatted, formatJsonInput(expectedInput, opts).formatted, label);
            const data = JSON.parse(result.formatted);
            assert.deepEqual(data, expected, label);
            assert.equal(data.orders[0].items[0].category, '数码', label);
            assert.deepEqual(data.orders[0].amount, expected.orders[0].amount, label);
            assert.equal(data.orders[0].remark, '工作日送', label);
            assert.deepEqual(data.orders[0].tags, ['首单'], label);
            assert(!Object.hasOwn(data.orders[0].items[0], 'amount'), label);
            await assert.rejects(formatWithOptionalRepair(sample, opts, false), { name: 'JsonInputParseError' }, label);
        }
    }
});
test('field-like lines inside a real multiline string retain the entire text when another comma is missing', async () => {
    const text = 'before\n}\namount:99\nremark: note\ncategory: \'数码\'\nafter';
    const expected = { text, n: 1, tail: 'kept' };
    const input = '{"text":"' + text + '" "n":1 "tail":"kept"}';
    assert.equal(findStringBoundaryRepair(input), undefined);
    const result = await formatWithOptionalRepair(input, opts, true);
    assert.deepEqual(JSON.parse(result.formatted), expected);
    assert.equal(result.formatted, formatJsonInput(JSON.stringify(expected), opts).formatted);
});
test('surrounding bare text keeps combined quote and comma defects on the existing repair fallback', async () => {
    const fixture = await readFile(new URL('./fixtures/jsonRepairMissingCategoryQuote.json', import.meta.url), 'utf8');
    const input = 'test\n' + fixture.replace('"title": "JM键盘",', '"title": "JM键盘"') + '\nend';
    const candidate = findStringBoundaryRepair(input);
    assert.notEqual(candidate, undefined);
    assert.throws(() => formatJsonInput(candidate, opts), { name: 'JsonInputParseError' });
    // A candidate that still contains surrounding prose cannot bypass full-input validation.
    const protector = new JsonPlusFormatter(false, opts.indentSize, opts.arrayNewLine, true);
    const protectedInput = protector.prepareRepairInput(normalizeRepairValues(selectRepairRoots(input)));
    const expectedRepair = protector.restoreRepairEscapes(jsonrepair(protectedInput.text), protectedInput.escapeMap);
    const result = await formatWithOptionalRepair(input, opts, true);
    assert.equal(result.repaired, expectedRepair);
    assert.equal(result.formatted, formatJsonInput(expectedRepair, opts).formatted);
});
test('missing value quote before standalone matching nested closers preserves objects and array items', async () => {
    for (const { name, input, expected } of [
        {
            name: 'adjacent nested closers',
            input: '{"outer":[{"leaf":{"category":"数码\n  }}],"after":1}',
            expected: '{"outer":[{"leaf":{"category":"数码"}}],"after":1}',
        },
        {
            name: 'single quote JSON5 values and keys',
            input: "{orders:[{items:[{category:'数码\n  }],amount:1,remark:'工作日送',tags:['首单'],}],}",
            expected: "{orders:[{items:[{category:'数码'}],amount:1,remark:'工作日送',tags:['首单'],}],}",
        },
        {
            name: 'array string value',
            input: '{"tags":["首单\n  ],"amount":1}',
            expected: '{"tags":["首单"],"amount":1}',
        },
        {
            name: 'quoted brackets and escaped quotes before the missing quote',
            input: String.raw`{"metadata":"[]{} : \"quote\" /#/*","leaf":{"category":"数码` + '\n  },"after":1}',
            expected: String.raw`{"metadata":"[]{} : \"quote\" /#/*","leaf":{"category":"数码"},"after":1}`,
        },
    ]) {
        const result = await formatWithOptionalRepair(input, opts, true);
        assert.notEqual(result.repaired, undefined, name);
        assert.equal(result.formatted, formatJsonInput(expected, opts).formatted, name);
    }
});
test('real closing quotes retain multiline string brackets when repair is needed elsewhere', async () => {
    const text = 'before\n}\n]\n# } is text\n// ] is text\n/* {} is text */\nafter';
    const expected = JSON.stringify({ text, n: 1 });
    for (const separator of [',', ' ']) {
        const input = '{"text":"' + text + '"' + separator + '"n":1}';
        const result = await formatWithOptionalRepair(input, opts, true);
        assert.equal(result.formatted, formatJsonInput(expected, opts).formatted);
        assert.deepEqual(JSON.parse(result.formatted), { text, n: 1 });
    }
});
test('escaped newline sequences and backslash continuations do not become missing quote boundaries', async () => {
    const escaped = String.raw`{"text":"before\n}\n]\nafter" "n":1}`;
    assert.equal((await formatWithOptionalRepair(escaped, opts, true)).formatted,
        formatJsonInput(escaped.replace(' "n"', ', "n"'), opts).formatted);
    for (const [input, expected, needsRepair] of [
        [String.raw`{text:'before\
}\
]\
after', n:1}`, '{"text":"before}]after","n":1}', false],
        [String.raw`{"text":"before\
}\
]\
after" "n":1}`, '{"text":"before}]after","n":1}', true],
    ]) {
        const result = await formatWithOptionalRepair(input, opts, true);
        assert.equal(result.repaired !== undefined, needsRepair);
        assert.equal(result.formatted, formatJsonInput(expected, opts).formatted);
    }
});
test('a real multiline closing quote cannot be hidden by newly exposed comments', async () => {
    for (const comment of ['#', '//']) {
        const input = `{items:[\n {category:"demo\n }\n],\namount:1,\n${comment} final"}]\n}`;
        assert.equal(findStringBoundaryRepair(input), undefined);
        const result = await formatWithOptionalRepair(input, opts, true);
        const text = `demo\n }\n],\namount:1,\n${comment} final`;
        assert.deepEqual(JSON.parse(result.formatted), { items: [{ category: text }] });
    }
});
test('continued CRLF lines, escaped quotes and existing multiline endings stay intact', async () => {
    for (const continuation of ['\\\r\n', '\\ \t\r\n']) {
        const input = '{"text":"before' + continuation + '}' + continuation + ']' + continuation + 'after" "n":1}';
        assert.equal(findStringBoundaryRepair(input), undefined);
        assert.deepEqual(JSON.parse((await formatWithOptionalRepair(input, opts, true)).formatted), { text: 'before}]after', n: 1 });
    }
    const text = 'before\n}\n],\nquoted "text"\nafter';
    const input = '{"text":"' + text.replaceAll('"', '\\"') + '" "n":1}';
    assert.equal(findStringBoundaryRepair(input), undefined);
    assert.deepEqual(JSON.parse((await formatWithOptionalRepair(input, opts, true)).formatted), { text, n: 1 });
});
test('quote boundary repair keeps trailing string spaces and current escape and number options', async () => {
    const input = String.raw`{"id":900719925474099312345,"leaf":{"category":"数码  
},"raw":"\u0041","after":1}`;
    const expected = input.replace('"数码  \n', '"数码  "\n');
    for (const encodingMode of [false, true]) {
        for (const preserveNumberLiterals of [false, true]) {
            const options = { ...opts, encodingMode, preserveNumberLiterals };
            const result = await formatWithOptionalRepair(input, options, true);
            assert.equal(result.repaired, expected);
            assert.equal(result.formatted, formatJsonInput(expected, options).formatted);
            assert.equal(JSON.parse(result.formatted).leaf.category, '数码  ');
        }
    }
});
test('combined quote and comma repair preserves complete JSON5 values, keys and exact number text', async () => {
    const values = [JSON.stringify('text with "quotes" and } ] "a":1 "b":2'), '900719925474099312345', '+1.2300e+20',
        '0xFF', 'true', 'false', 'null', 'undefined', 'NaN', '-Infinity', '{nested:1}', '[1,"two"]'];
    for (const value of values) {
        for (const key of ['"next"', 'next', 'true', 'Infinity', '字段']) {
            const prefix = `{before:${value}`;
            const tail = ` /* "fake":1 } ] */\n${key}:2,leaf:{category:"数码\n},after:1}`;
            const input = prefix + tail;
            const expected = (prefix + ',' + tail).replace('"数码\n', '"数码"\n');
            const result = await formatWithOptionalRepair(input, opts, true);
            assert.equal(result.repaired, expected, `${value} followed by ${key}`);
            assert.equal(result.formatted, formatJsonInput(expected, opts).formatted, `${value} followed by ${key}`);
        }
    }
});
test('object comma completion discards all changes on ambiguous or unfinished syntax', () => {
    for (const value of ['12e+', '1USD', 'hello', '/"a{2}\\}/', 'truefalse']) {
        const input = `{first:"ok" next:1,bad:${value} after:2}`;
        assert.equal(insertMissingObjectCommas(input), input, value);
    }
    for (const input of ['prefix\n{first:"ok" next:1}', '{first:"ok" next:1}\nend',
        '{first:"ok" next:1,broken:"no end}', '{first:"ok" next:1,arr:[1 2]}']) {
        assert.equal(insertMissingObjectCommas(input), input);
    }
});
test('a real multiline closing quote before an unquoted key cannot become an early string boundary', () => {
    const text = 'before\n }\n ],\n amount:99\n end';
    const input = `{items:[{text:"${text}" next:1}] n:2}`;
    assert.equal(findStringBoundaryRepair(input), undefined);
    assert.equal(insertMissingObjectCommas(input), `{items:[{text:"${text}", next:1}], n:2}`);
});
test('combined quote and comma repair accepts line comments immediately after a value colon', async () => {
    const base = await readFile(new URL('./fixtures/jsonRepairMissingCategoryQuote.json', import.meta.url), 'utf8');
    for (const key of ['"qty"', 'qty']) {
        const input = base.replace('"title": "JM键盘",', '"title": "JM键盘"')
            .replace('"qty": 1,', `${key}:// } ] "fake": "value"\n          1,`);
        const expected = input.replace('"title": "JM键盘"', '"title": "JM键盘",')
            .replace('"category": "数码\n', '"category": "数码"\n');
        const result = await formatWithOptionalRepair(input, opts, true);
        assert.equal(result.repaired, expected);
        assert.equal(result.formatted, formatJsonInput(expected, opts).formatted);
    }
});
test('comments and regex quotes or brackets cannot change the container stack used by quote repair', async () => {
    const comments = '/* { "fake": "value\n}\n] */\n{\n// ] "fake" {\n# } "fake" [\n"leaf":{"category":"数码\n}\n,"after":1\n}';
    assert.equal((await formatWithOptionalRepair(comments, opts, true)).formatted,
        formatJsonInput('{"leaf":{"category":"数码"},"after":1}', opts).formatted);
    const input = String.raw`{"pattern":/"a{2}\\}/ "n":1}`;
    const expected = JSON.stringify({ pattern: String.raw`/"a{2}\\}/`, n: 1 });
    assert.equal((await formatWithOptionalRepair(input, opts, true)).formatted, formatJsonInput(expected, opts).formatted);
});
test('root extraction retains escapes and precision under both decoding and precision options', async () => {
    const body = String.raw`{"id":+900719925474099312345, "raw":"\u0041", "hex":"\xE4\xBD\xA0\xE5\xA5\xBD", "nested":"{\"name\":\"test\"}"}`;
    const input = '"prefix {}"\n' + body + '\nend';
    for (const encodingMode of [false, true]) {
        for (const preserveNumberLiterals of [false, true]) {
            const options = { ...opts, encodingMode, preserveNumberLiterals };
            assert.equal((await formatWithOptionalRepair(input, options, true)).formatted, formatJsonInput(body, options).formatted);
        }
    }
});
test('repair normalizes only values, preserves keys and strings', () => {
    assert.equal(normalizeRepairValues('{NaN:"Infinity 0xFF undefined", Infinity:NaN, n:-0xFF}'), '{NaN:"Infinity 0xFF undefined", Infinity:null, n:-255}');
});
test('leading plus normalization preserves quoted strings, comments, exponent signs and precision', () => {
    const input = String.raw`{"a":+900719925474099312345, "b":+1.2300e+20, "c":+0xFF, "raw":"+99 +1e+2", '+99':'+.5', "n":-99, /* +99 */ "d":+.50, // +1e+2
"e":+1.}`;
    const expected = input.replace(':+900719925474099312345', ':900719925474099312345')
        .replace(':+1.2300e+20', ':1.2300e+20').replace(':+0xFF', ':255')
        .replace(':+.50', ':.50').replace(':+1.', ':1.');
    assert.equal(normalizeRepairValues(input), expected);
    for (const input of ['{"a":+1e "b":2}', '{"a":+99USD "b":2}', '{"a":+1..2 "b":2}', '{"a":++99}', '{"a":hello +99}']) {
        assert.equal(normalizeRepairValues(input), input);
    }
    assert.equal(normalizeRepairValues('{"text":hello +99, "items":[true +2 null +3]}'),
        '{"text":hello +99, "items":[true 2 null 3]}');
});

// Delete only structural commas; string contents and comments remain exactly as supplied.
function structuralCommaPositions(input) {
    const positions = [];
    for (let i = 0; i < input.length; i++) {
        const char = input[i];
        if (char === '"' || char === "'") {
            while (++i < input.length) {
                if (input[i] === '\\') { i++; continue; }
                if (input[i] === char) break;
            }
            continue;
        }
        if (char === '#' || (char === '/' && input[i + 1] === '/')) {
            while (i < input.length && input[i] !== '\n') i++;
            continue;
        }
        if (char === '/' && input[i + 1] === '*') {
            const end = input.indexOf('*/', i + 2);
            i = end < 0 ? input.length : end + 1;
            continue;
        }
        if (char === ',') positions.push(i);
    }
    return positions;
}
test('mixed JSON5/extensions repair every single missing structural comma without changing data', async () => {
    const input = await readFile(new URL('./fixtures/jsonRepairExtendedInput.txt', import.meta.url), 'utf8');
    const positions = structuralCommaPositions(input);
    assert(positions.length > 30);
    for (const encodingMode of [false, true]) {
        for (const preserveNumberLiterals of [false, true]) {
            const options = { ...opts, encodingMode, preserveNumberLiterals };
            const expected = formatJsonInput(input, options).formatted;
            assert.equal((await formatWithOptionalRepair(input, options, true)).repaired, undefined);
            for (const position of positions) {
                const broken = input.slice(0, position) + input.slice(position + 1);
                const result = await formatWithOptionalRepair(broken, options, true);
                assert.equal(result.formatted, expected, `comma at ${position}, encoding=${encodingMode}, precision=${preserveNumberLiterals}`);
            }
            const broken = [...positions].reverse().reduce((text, index) => text.slice(0, index) + text.slice(index + 1), input);
            assert.equal((await formatWithOptionalRepair(broken, options, true)).formatted, expected);
        }
    }
});
test('malformed HTML returns an error, no candidate output', async () => {
    await assert.rejects(formatWithOptionalRepair('<html><body>Error</body></html>', opts, true));
});
test('precision and escape protection are preserved together with decoding options', async () => {
    const input = String.raw`{"id":900719925474099312345 "raw":"\u0041" "hex":"\x41"}`;
    for (const encodingMode of [true, false]) {
        const result = await formatWithOptionalRepair(input, { ...opts, encodingMode }, true);
        assert.equal(result.formatted, formatJsonInput(input.replaceAll(' "', ', "'), { ...opts, encodingMode }).formatted);
    }
});
test('cancel terminates a busy worker and ignores delayed success', async () => {
    const worker = { postMessage() {}, terminate() { this.terminated = true; } };
    const task = startFormatTask('input', opts, true, () => {}, () => worker);
    task.cancel();
    await assert.rejects(task.promise, { name: 'AbortError' });
    assert.equal(worker.terminated, true);
    worker.onmessage({ data: { type: 'success', formatted: 'late' } });
    task.cancel();
});
test('worker success releases worker, stage is delivered before final output', async () => {
    const stages = [];
    const worker = { postMessage() {}, terminate() { this.terminated = true; } };
    const task = startFormatTask('input', opts, true, stage => stages.push(stage), () => worker);
    worker.onmessage({ data: { type: 'stage', stage: 'repairing' } });
    worker.onmessage({ data: { type: 'success', formatted: '{"a":1}', comparisonId: 'snapshot' } });
    assert.deepEqual(await task.promise, { formatted: '{"a":1}', comparisonId: 'snapshot' });
    assert.equal(worker.terminated, true);
    assert.deepEqual(stages, ['repairing']);
});
test('worker startup failure and execution error release resources', async () => {
    await assert.rejects(startFormatTask('', opts, true, () => {}, () => { throw new Error('unavailable'); }).promise, /unavailable/);
    const worker = { postMessage() {}, terminate() { this.terminated = true; } };
    const task = startFormatTask('', opts, true, () => {}, () => worker);
    worker.onerror({ message: 'failed' });
    await assert.rejects(task.promise, /failed/);
    assert(worker.terminated);
});
test('formatting failure is not retried as JSON repair', async () => {
    const stages = [];
    await assert.rejects(formatWithOptionalRepair('{"a":1}', { ...opts, indentSize: -1 }, true, stage => stages.push(stage)), RangeError);
    assert(!stages.includes('repairing'));
});
test('hexadecimal literals longer than 80 characters preserve all digits', async () => {
    const hex = '0x' + 'f'.repeat(100);
    const result = await formatWithOptionalRepair(`{"n":${hex} "x":1}`, opts, true);
    assert(result.formatted.includes(BigInt(hex).toString()));
});

// Exercise timing and task transitions independently of rendering; browser checks cover the Vue DOM.
const uiBundle = await build({
    entryPoints: ['src/components/composables/useJsonRepair.ts'], bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [{ name: 'lifecycle-test', setup(plugin) {
        plugin.onResolve({ filter: /^vue$/ }, () => ({ path: 'vue', namespace: 'lifecycle-test' }));
        plugin.onLoad({ filter: /.*/, namespace: 'lifecycle-test' }, () => ({ contents: 'export const ref = value => ({ value }); export const onBeforeUnmount = () => {};', loader: 'js' }));
    } }],
});
const { useJsonRepair } = await import(`data:text/javascript;base64,${Buffer.from(uiBundle.outputFiles[0].text).toString('base64')}`);
function createRepairHarness() {
    const tasks = [];
    const ui = useJsonRepair((_input, _options, _enabled, stage) => {
        let resolve, reject;
        const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
        const task = { stage, resolve, reject, cancelled: false, promise,
            cancel() { this.cancelled = true; const error = new Error('Superseded'); error.name = 'AbortError'; reject(error); },
        };
        tasks.push(task);
        return task;
    });
    return { ui, tasks };
}
test('slow ordinary parsing/formatting never locks the UI or shows repair loading', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    for (const enabled of [false, true]) {
        const { ui, tasks } = createRepairHarness();
        const pending = ui.format('valid', opts, enabled);
        tasks[0].stage('parsing'); t.mock.timers.tick(5000);
        assert(ui.busy.value); assert(!ui.repairing.value); assert(!ui.showLoading.value);
        tasks[0].stage('formatting'); t.mock.timers.tick(5000);
        assert(!ui.repairing.value); assert(!ui.showLoading.value);
        tasks[0].resolve({ formatted: '{}' }); await pending;
        assert(!ui.busy.value);
    }
});
test('repair loading starts 300 ms after repair begins, stays through reparse/format/save, clears on success', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { ui, tasks } = createRepairHarness();
    const pending = ui.format('broken', opts, true);
    t.mock.timers.tick(2000); assert(!ui.showLoading.value);
    tasks[0].stage('repairing'); assert(ui.repairing.value); assert(!ui.showLoading.value);
    t.mock.timers.tick(299); assert(!ui.showLoading.value);
    tasks[0].stage('parsing'); tasks[0].stage('formatting');
    assert(ui.repairing.value);
    t.mock.timers.tick(1); assert(ui.showLoading.value);
    tasks[0].stage('saving'); assert(ui.repairing.value); assert(ui.showLoading.value);
    tasks[0].resolve({ formatted: '{}', comparisonId: 'snapshot' }); await pending;
    assert(!ui.repairing.value); assert(!ui.showLoading.value); assert(!ui.busy.value);
    assert.equal(ui.comparisonId.value, 'snapshot');
});
test('quick repair never flashes loading after completion', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { ui, tasks } = createRepairHarness();
    const pending = ui.format('broken', opts, true);
    tasks[0].stage('repairing'); t.mock.timers.tick(50);
    tasks[0].resolve({ formatted: '{}' }); await pending;
    t.mock.timers.tick(1000);
    assert(!ui.repairing.value); assert(!ui.showLoading.value);
});
test('disabled repair cannot activate waiting even if a stale stage is reported', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { ui, tasks } = createRepairHarness();
    const pending = ui.format('broken', opts, false);
    tasks[0].stage('repairing'); t.mock.timers.tick(1000);
    assert(!ui.repairing.value); assert(!ui.showLoading.value);
    const rejected = assert.rejects(pending, /parse failure/);
    tasks[0].reject(new Error('parse failure')); await rejected;
});
test('repair failure restores UI and prevents a late loading indicator', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { ui, tasks } = createRepairHarness();
    const pending = ui.format('broken', opts, true);
    tasks[0].stage('repairing'); t.mock.timers.tick(300); assert(ui.showLoading.value);
    const rejected = assert.rejects(pending, /repair failure/);
    tasks[0].reject(new Error('repair failure')); await rejected;
    t.mock.timers.tick(1000);
    assert(!ui.busy.value); assert(!ui.repairing.value); assert(!ui.showLoading.value);
});
test('superseded input terminates the task and cannot lock or publish over the next operation', async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const { ui, tasks } = createRepairHarness();
    const first = ui.format('old input', opts, true);
    tasks[0].stage('repairing');
    const rejected = assert.rejects(first, { name: 'AbortError' });
    const second = ui.format('new input', opts, true); await rejected;
    assert(tasks[0].cancelled);
    tasks[0].stage('repairing'); tasks[0].resolve({ formatted: 'old', comparisonId: 'old' });
    t.mock.timers.tick(1000);
    assert(ui.busy.value); assert(!ui.repairing.value); assert(!ui.showLoading.value);
    tasks[1].resolve({ formatted: 'new' }); assert.deepEqual(await second, { formatted: 'new' });
    assert.equal(ui.comparisonId.value, '');
});
