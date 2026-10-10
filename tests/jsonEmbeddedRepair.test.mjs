import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';

async function bundle(path) {
    const result = await build({ entryPoints: [path], bundle: true, write: false, format: 'esm', platform: 'node' });
    return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
}
const { formatWithOptionalRepair } = await bundle('src/components/utils/jsonRepair.ts');
const { findEmbeddedJsonStringRepair } = await bundle('src/components/utils/repairEmbeddedJsonStrings.ts');
const { formatJsonInput } = await bundle('src/components/utils/jsonEngine/service.ts');
const opts = { indentSize: 2, arrayNewLine: true, preserveNumberLiterals: true, encodingMode: false };

function replaceOnce(input, original, replacement) {
    assert.equal(input.split(original).length, 2, 'the mutation must target one known value');
    return input.replace(original, replacement);
}

// Delete only the escape for the first inner quotation mark. Inner JSON text stays known independently.
function loseFirstInnerQuoteEscape(input, inner) {
    const token = JSON.stringify(inner);
    const index = token.indexOf('\\"');
    assert(index >= 0, 'the source contains an escaped inner quote');
    return replaceOnce(input, token, token.slice(0, index) + token.slice(index + 1));
}

// This mutation is restricted to inner documents without business backslashes or escaped string quotes.
function loseInnerQuoteEscapes(input, inner) {
    assert(!inner.includes('\\'), 'all-quote mutations must not erase ambiguous business escapes');
    return replaceOnce(input, JSON.stringify(inner), '"' + inner + '"');
}

async function assertKnownRepair(broken, original, label) {
    const candidate = findEmbeddedJsonStringRepair(broken);
    assert.notEqual(candidate, undefined, label);
    assert.deepEqual(JSON.parse(candidate), JSON.parse(original), label);
    const stages = [];
    const result = await formatWithOptionalRepair(broken, opts, true, stage => stages.push(stage));
    assert.notEqual(result.repaired, undefined, label);
    assert.deepEqual(JSON.parse(result.repaired), JSON.parse(original), label);
    assert.equal(result.formatted, formatJsonInput(original, opts).formatted, label);
    assert(stages.includes('repairing'), label);
    await assert.rejects(formatWithOptionalRepair(broken, opts, false), { name: 'JsonInputParseError' }, label);
    return result;
}

test('sample 11 restores one missing inner quote escape while preserving payload and sibling stats', async () => {
    const inner = JSON.stringify({ user: 'Alice', message: 'hello', active: true });
    const original = JSON.stringify({ requestId: 'REQ-ESCAPE', payload: inner, stats: { ok: true } }, null, 2);
    const broken = loseFirstInnerQuoteEscape(original, inner);
    const result = await assertKnownRepair(broken, original, 'sample 11');
    const data = JSON.parse(result.formatted);
    assert.equal(typeof data.payload, 'string');
    assert.equal(data.payload, inner);
    assert.deepEqual(data.stats, { ok: true });
});

test('sample 12 restores missing inner quote escapes without expanding the payload string', async () => {
    const inner = JSON.stringify({ user: 'Alice', message: 'hello', active: true });
    const original = JSON.stringify({ requestId: 'REQ-ESCAPE', payload: inner, stats: { ok: true } }, null, 2);
    const broken = loseInnerQuoteEscapes(original, inner);
    const result = await assertKnownRepair(broken, original, 'sample 12');
    assert.deepEqual(JSON.parse(result.formatted), { requestId: 'REQ-ESCAPE', payload: inner, stats: { ok: true } });
});

test('an inner array beginning with a string remains a string value after its quote escapes are restored', async () => {
    const inner = JSON.stringify(['first', '末尾', { items: [1, true, null] }]);
    const original = JSON.stringify({ payload: inner, stats: { total: 3 } });
    await assertKnownRepair(loseInnerQuoteEscapes(original, inner), original, 'inner array beginning with a string');
});

test('deterministic single-escape mutations preserve nested documents, business quotes, slashes and Unicode', async () => {
    for (let index = 0; index < 48; index++) {
        const data = {
            id: index,
            name: index % 2 ? '张三 😀' : 'Alice',
            message: '客服说："hello"；} ] 不是结构；// # /* text */',
            path: 'C:\\temp\\' + index + '\\',
            network: '\\\\server\\share\\',
            literal: '\\u0041\\n\\x41',
            child: JSON.stringify({ index, enabled: index % 2 === 0 }),
        };
        const inner = JSON.stringify(index % 3 === 0 ? [data, { tail: true }, 'kept'] : data, null, index % 4 === 0 ? 2 : undefined);
        const original = JSON.stringify({ requestId: `REQ-${index}`, payload: inner, stats: { index, ok: true } }, null, 2);
        await assertKnownRepair(loseFirstInnerQuoteEscape(original, inner), original, `single escape ${index}`);
    }
});

test('deterministic complete quote-escape loss preserves strict object and array payloads', async () => {
    for (let index = 0; index < 32; index++) {
        const value = { id: index, name: index % 2 ? '数码' : 'Alice', enabled: index % 2 === 0, tags: ['首单', 'JSON'], child: { qty: 1 } };
        const inner = JSON.stringify(index % 2 ? [value, 'tail', null] : value);
        const original = JSON.stringify({ payload: inner, stats: { count: 1, index } });
        await assertKnownRepair(loseInnerQuoteEscapes(original, inner), original, `all quote escapes ${index}`);
    }
});

test('one damaged payload among several encoded values preserves deeply nested array paths and every sibling', async () => {
    const inner = JSON.stringify({ category: '数码', items: [{ sku: 'S0' }] });
    const original = JSON.stringify({
        payload: JSON.stringify({ unchanged: true }),
        rows: [[{ payload: inner, tail: 'kept' }, JSON.stringify([1, 2])], [{ payload: JSON.stringify({ other: true }) }]],
        stats: { count: 3 },
    }, null, 2);
    const result = await assertKnownRepair(loseInnerQuoteEscapes(original, inner), original, 'deep array payload');
    const data = JSON.parse(result.formatted);
    assert.equal(data.rows[0][0].payload, inner);
    assert.equal(typeof data.rows[0][0].payload, 'string');
    assert.equal(data.rows[0][0].tail, 'kept');
    assert.deepEqual(data.stats, { count: 3 });
});

test('several independent damaged payloads are adopted together only after complete outer validation', async () => {
    const first = JSON.stringify({ a: 1, name: 'Alice' });
    const second = JSON.stringify(['数码', { b: 2 }]);
    const original = JSON.stringify({ first, rows: [{ second, kept: 'tail' }], stats: { ok: true } }, null, 2);
    const broken = loseFirstInnerQuoteEscape(loseInnerQuoteEscapes(original, second), first);
    await assertKnownRepair(broken, original, 'several clear payloads');
});

test('repair keeps inner number literals and lexical whitespace instead of reserializing parsed inner numbers', async () => {
    const inner = '{ "id" : 900719925474099312345, "amount":99999999999999999.99, "scientific":1.2300e+20, "raw":"\\\\u0041" }';
    const original = JSON.stringify({ payload: inner, stats: { ok: true } });
    const result = await assertKnownRepair(loseFirstInnerQuoteEscape(original, inner), original, 'precision and inner whitespace');
    const payload = JSON.parse(result.formatted).payload;
    assert.equal(payload, inner);
    for (const literal of ['900719925474099312345', '99999999999999999.99', '1.2300e+20']) assert(payload.includes(literal));
});

test('hundreds of valid JSON documents and encoded string levels never trigger embedded repair', async () => {
    for (let index = 0; index < 240; index++) {
        const inner = JSON.stringify({ id: index, quote: '" } ] : ', path: 'C:\\logs\\', raw: '\\u0041\\n', child: JSON.stringify({ ok: true }) });
        const values = [
            { payload: inner, stats: { index }, literals: ['123', 'true', 'null', '{not json}', 'prefix {"a":1} suffix'] },
            [{ rows: [[inner]], key: '{"ordinary":"key text"}' }, JSON.stringify(inner)],
            JSON.stringify(inner),
            { payload: JSON.stringify(inner), escaped: inner.replaceAll('"', '\\"'), metadata: ['[]{}', 'https://example.com/#id'] },
        ];
        const input = JSON.stringify(values[index % values.length], null, index % 3 === 0 ? 2 : undefined);
        assert.equal(findEmbeddedJsonStringRepair(input), undefined, `valid original ${index}`);
        const stages = [];
        const result = await formatWithOptionalRepair(input, opts, true, stage => stages.push(stage));
        assert.equal(result.repaired, undefined, `valid original ${index}`);
        assert.equal(result.formatted, formatJsonInput(input, opts).formatted, `valid original ${index}`);
        assert(!stages.includes('repairing'), `valid original ${index}`);
    }
});

test('valid JSON5 quoting, keys, comments and compatible values retain ordinary formatting priority', async () => {
    for (const input of [
        `{payload:'{"name":"Alice","items":[1,2]}', stats:{ok:true,},}`,
        `{payload:"{\\\"a\\\":1}", /* "payload":"{broken}" } ] */ stats:undefined, count:NaN, hex:0xFF,}`,
        `// "fake":"{"a":1}"\n{payload:'[]', stats:{name:'say "hi"', path:'C:\\\\temp\\\\'},}`,
        `{payload:'ordinary } ] text', scalars:['123','true','null'],}`,
    ]) {
        assert.equal(findEmbeddedJsonStringRepair(input), undefined, input);
        const result = await formatWithOptionalRepair(input, opts, true);
        assert.equal(result.repaired, undefined, input);
        assert.equal(result.formatted, formatJsonInput(input, opts).formatted, input);
    }
});

test('helper declines text, scalars, truncated containers and non-strict inner documents', () => {
    const negatives = [
        ['ordinary prose with unescaped quotes', '{"payload":"say "hello" today","stats":1}'],
        ['container fragment surrounded by prose', '{"payload":"before {"a":1} after","stats":1}'],
        ['string scalar', '{"payload":""hello"","stats":1}'],
        ['truncated inner object', '{"payload":"{"a":1","stats":1}'],
        ['truncated inner array', '{"payload":"["a",1","stats":1}'],
        ['inner missing comma', '{"payload":"{"a":1 "b":2}","stats":1}'],
        ['inner missing colon', '{"payload":"{"a" 1}","stats":1}'],
        ['inner trailing comma', '{"payload":"{"a":1,}","stats":1}'],
        ['inner unquoted JSON5 key', '{"payload":"{a:"value"}","stats":1}'],
        ['inner comments', '{"payload":"{/* note */"a":1}","stats":1}'],
        ['inner NaN', '{"payload":"{"a":NaN}","stats":1}'],
        ['inner illegal escape', String.raw`{"payload":"{"path":"C:\q"}","stats":1}`],
        ['unclosed inner business string', '{"payload":"{"a":"value}","stats":1}'],
        ['quoted ordinary path', '{"payload":"C:\\temp\\"file"","stats":1}'],
        ['root object-shaped string', '"{"a":1}"'],
        ['root array-shaped string', '"["x",2]"'],
    ];
    for (const [name, input] of negatives) assert.equal(findEmbeddedJsonStringRepair(input), undefined, name);
});

test('helper never publishes a partial edit when the complete outer document still has unrelated errors', () => {
    const negatives = [
        ['missing outer comma', '{"payload":"{"a":1}" "stats":1}'],
        ['missing outer colon', '{"payload":"{"a":1}","stats" 1}'],
        ['unclosed outer object', '{"payload":"{"a":1}","stats":1'],
        ['mismatched outer container', '{"payload":"{"a":1}","stats":1]'],
        ['surrounding prose', 'prefix\n{"payload":"{"a":1}","stats":1}\nsuffix'],
        ['Markdown fence', '```json\n{"payload":"{"a":1}","stats":1}\n```'],
        ['missing payload end delimiter', '{"payload":"{"a":1}, "stats":1}'],
        ['JSON5 outer key', '{payload:"{"a":1}",stats:1}'],
        ['JSON5 outer trailing comma', '{"payload":"{"a":1}","stats":1,}'],
        ['one clear payload and one truncated payload', '{"first":"{"a":1}","second":"{"b":2","stats":1}'],
    ];
    for (const [name, input] of negatives) assert.equal(findEmbeddedJsonStringRepair(input), undefined, name);
});

test('ordinary bracket strings and a boolean stay separate while a later damaged payload is repaired', async () => {
    const broken = '["[",true,"]","{"x":1}"]';
    const original = JSON.stringify(['[', true, ']', '{"x":1}']);
    const result = await assertKnownRepair(broken, original, 'ordinary bracket strings before damaged payload');
    const data = JSON.parse(result.formatted);
    assert.deepEqual(data, ['[', true, ']', '{"x":1}']);
    assert.equal(data.length, 4);
    assert.equal(typeof data[3], 'string');
});

test('a missing comma after an ordinary bracket string cannot be repaired by merging earlier array values', () => {
    const broken = '["[" true,"]","{"x":1}"]';
    assert.equal(findEmbeddedJsonStringRepair(broken), undefined);
});

test('JSON5 value starts after a missing separator cannot merge ordinary array strings and change value types', () => {
    for (const token of ['+1', "'other'", '.5', 'undefined', 'NaN', 'Infinity', '“other”', '‘other’']) {
        const broken = '["[" ' + token + ',true,"]","{"x":1}"]';
        assert.equal(findEmbeddedJsonStringRepair(broken), undefined, token);
    }
});

test('bare JSON5 next keys and their trivia cannot be swallowed into an embedded string key', () => {
    const negatives = [
        ['bare id key', String.raw`{"payload":"{" id:":true, \"a\":1}", "broken":"{"x":1}"}`],
        ['bare Unicode key', String.raw`{"payload":"{" 账户:":true, \"a\":1}", "broken":"{"x":1}"}`],
        ['comment between bare key and colon', String.raw`{"payload":"{" id/*note*/:":true, \"a\":1}", "broken":"{"x":1}"}`],
        ['Unicode escape in bare key', String.raw`{"payload":"{" \u0069d:":true, \"a\":1}", "broken":"{"x":1}"}`],
        ['combining mark in bare key', String.raw`{"payload":"{" id:":true, \"a\":1}", "broken":"{"x":1}"}`.replace('id:', 'a\u0301:')],
        ['ZWNJ in bare key', String.raw`{"payload":"{" id:":true, \"a\":1}", "broken":"{"x":1}"}`.replace('id:', 'admin\u200C:')],
    ];
    for (const [name, broken] of negatives) assert.equal(findEmbeddedJsonStringRepair(broken), undefined, name);
});

test('JSON5 comments and Unicode whitespace after a normal string end cannot merge earlier business array values', () => {
    const trivia = [
        ['block comment', '/*note*/'],
        ['line comment', '// note\n'],
        ['hash line comment', '# note\n'],
        ['NBSP U+00A0', '\u00A0'],
        ['line separator U+2028', '\u2028'],
        ['BOM U+FEFF', '\uFEFF'],
        ['paragraph separator U+2029', '\u2029'],
        ['Ogham space U+1680', '\u1680'],
        ['en quad U+2000', '\u2000'],
        ['hair space U+200A', '\u200A'],
        ['narrow NBSP U+202F', '\u202F'],
        ['medium mathematical space U+205F', '\u205F'],
        ['ideographic space U+3000', '\u3000'],
        ['vertical tab', '\v'],
        ['form feed', '\f'],
        ['mixed Unicode whitespace and comments', '\uFEFF/* note */\u2028// next\n\u00A0'],
    ];
    for (const [name, value] of trivia) {
        const broken = '["["' + value + ',true,"]","{"x":1}"]';
        assert.equal(findEmbeddedJsonStringRepair(broken), undefined, name);
    }
});

test('a first unescaped quote at an existing inner string end cannot absorb a sibling admin field', () => {
    const broken = String.raw`{"payload":"{\"text\":\"}", "admin":true}"}`;
    assert.equal(findEmbeddedJsonStringRepair(broken), undefined);
});

test('a JSON5 sibling key cannot be swallowed to make a later embedded payload pass strict outer validation', () => {
    const broken = String.raw`{"payload":"{\"a\":1,", admin:":true, \"tail\":\"x\"}", "broken":"{"x":1}"}`;
    assert.equal(findEmbeddedJsonStringRepair(broken), undefined);
});

test('embedded repair preserves the original tokens under every precision and decoding option', async () => {
    const inner = String.raw`{ "id":900719925474099312345, "amount":99999999999999999.99, "scientific":1.2300e+20, "label":"\u6D4B\u8BD5", "emoji":"\uD83D\uDE00", "literal":"\\u0041", "hexLiteral":"\\x41", "path":"C:\\logs\\" }`;
    const original = '{"outerId":900719925474099312345,"payload":' + JSON.stringify(inner) + ',"stats":{"ok":true}}';
    const broken = loseFirstInnerQuoteEscape(original, inner);
    assert.equal(findEmbeddedJsonStringRepair(broken), original);
    for (const encodingMode of [false, true]) {
        for (const preserveNumberLiterals of [false, true]) {
            const options = { ...opts, encodingMode, preserveNumberLiterals };
            const label = `encoding=${encodingMode}, precision=${preserveNumberLiterals}`;
            const result = await formatWithOptionalRepair(broken, options, true);
            assert.equal(result.repaired, original, label);
            assert.equal(result.formatted, formatJsonInput(original, options).formatted, label);
            assert.equal(typeof JSON.parse(result.formatted).payload, 'string', label);
        }
    }
});

test('a payload requiring more quote insertions than the JS argument limit repairs without a spread overflow', () => {
    const count = 50_000;
    const records = Array.from({ length: count }, (_, id) => ({ id, label: 'row-' + id }));
    const inner = JSON.stringify(records);
    assert(inner.match(/"/g).length > 125_000, 'the regression exceeds the former spread argument limit');
    const original = JSON.stringify({ payload: inner, stats: { count } });
    const broken = loseInnerQuoteEscapes(original, inner);
    const candidate = findEmbeddedJsonStringRepair(broken);
    assert.equal(candidate, original);
    assert.equal(JSON.parse(candidate).payload, inner);
});

test('Unicode identifiers and comments around a missing outer separator cannot move sibling fields into a string', () => {
    const keys = [
        'admin/*note*/', String.raw`\u0061dmin`, String.raw`\u0061\u0064min`,
        'a\u0301', 'admin\u200C', 'admin\u200D', '\u{10400}field',
        'id// comment\n', 'id# comment\n', 'id /* first */ \u00A0 /* second */ ',
    ];
    for (const key of keys) {
        // The key is an unquoted sibling, and its value is the ordinary string ":1}".
        const sibling = '{"left":"{" ' + key + ':\":1}", "broken":"{"x":1}"}';
        assert.equal(findEmbeddedJsonStringRepair(sibling), undefined, key);
    }
});

test('other recognizable outer repair tokens cannot be absorbed into earlier array strings', () => {
    for (const token of ['Alice', 'Alice/*note*/', '/x/', 'NumberLong("12")', 'callback({"id":1})']) {
        const broken = '["[" ' + token + ',true,"]","{"x":1}"]';
        assert.equal(findEmbeddedJsonStringRepair(broken), undefined, token);
    }
    assert.equal(findEmbeddedJsonStringRepair('["[";true,"]","{"x":1}"]'), undefined);
});
