import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { runInNewContext } from 'node:vm';

const bundle = await build({
    entryPoints: ['src/components/composables/useJsonFoldingInfoDisplay.ts'],
    bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{ name: 'monaco-options', setup(build) {
        build.onResolve({ filter: /^monaco-editor\/esm\/vs\/editor\/editor\.api$/ }, () => ({ path: 'monaco', namespace: 'mock' }));
        build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const editor = { EditorOption: { lineHeight: 1 } };' }));
    } }],
});

// Monaco renders only these visible rows; the orders fold hides almost one million model lines.
const MILLION_LINES = 1000000;
const STATS_LINE = MILLION_LINES - 5;
const visibleModelLines = [1, 2, 6, 7, STATS_LINE - 1, STATS_LINE, MILLION_LINES - 1, MILLION_LINES];

const fixture = ({ lines = MILLION_LINES, hitTest = true } = {}) => {
    let clock = 0, nextId = 1, lineTopReads = 0, domScans = 0, observerDeliveries = 0;
    const lineTopQueries = [];
    const tasks = new Map(), microtasks = [], observers = [];
    const enqueue = (fn, delay) => {
        const id = nextId++;
        tasks.set(id, { fn, at: clock + delay });
        return id;
    };
    const queueMutation = (mutation) => {
        for (const observer of observers) {
            const watches = observer.watches.filter(({ target, options }) => target === mutation.target || (options.subtree && target.contains(mutation.target)));
            if (!watches.some(({ options }) => mutation.type === 'childList' ? options.childList : options.attributes && (!options.attributeFilter || options.attributeFilter.includes(mutation.attributeName)))) continue;
            observer.records.push(mutation);
            if (observer.queued) continue;
            observer.queued = true;
            microtasks.push(() => {
                observer.queued = false;
                const records = observer.records.splice(0);
                if (records.length && observer.watches.length) {
                    observerDeliveries++;
                    observer.callback(records, observer);
                }
            });
        }
    };
    class Element {
        constructor(className = '', lineNumber = null, top = 0) {
            this._className = className; this._textContent = ''; this.lineNumber = lineNumber;
            this.top = top; this.parentNode = null; this.children = []; this.rootConnected = false;
            this.classList = {
                contains: (name) => this.className.split(/\s+/).includes(name),
                add: (name) => { if (!this.classList.contains(name)) this.className = `${this.className} ${name}`.trim(); },
                remove: (name) => { this.className = this.className.split(/\s+/).filter((part) => part !== name).join(' '); },
            };
        }
        get className() { return this._className; }
        set className(value) {
            const oldValue = this._className; this._className = value;
            queueMutation({ type: 'attributes', target: this, attributeName: 'class', oldValue });
        }
        get textContent() { return this._textContent; }
        set textContent(value) {
            this._textContent = value;
            queueMutation({ type: 'childList', target: this, addedNodes: [], removedNodes: [] });
        }
        get nextSibling() { return this.parentNode?.children[this.parentNode.children.indexOf(this) + 1] ?? null; }
        get isConnected() { return this.rootConnected || Boolean(this.parentNode?.isConnected); }
        contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
        matches(selector) { return selector.split(',').some((part) => part.trim().startsWith('.') && this.classList.contains(part.trim().slice(1))); }
        querySelectorAll(selector) {
            domScans++;
            const result = [];
            const visit = (node) => { for (const child of node.children) { if (child.matches(selector)) result.push(child); visit(child); } };
            visit(this);
            return result;
        }
        querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
        closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest(selector) ?? null; }
        insertBefore(node, before) {
            if (node.parentNode) node.remove();
            const at = before ? this.children.indexOf(before) : this.children.length;
            assert.ok(at >= 0, 'insertBefore references an actual child');
            this.children.splice(at, 0, node); node.parentNode = this;
            queueMutation({ type: 'childList', target: this, addedNodes: [node], removedNodes: [] });
            return node;
        }
        appendChild(node) { return this.insertBefore(node, null); }
        remove() {
            const parent = this.parentNode;
            if (!parent) return;
            parent.children.splice(parent.children.indexOf(this), 1); this.parentNode = null;
            queueMutation({ type: 'childList', target: parent, addedNodes: [], removedNodes: [this] });
        }
        replaceWith(next) {
            const parent = this.parentNode;
            const at = parent.children.indexOf(this);
            parent.children[at] = next; next.parentNode = parent; this.parentNode = null;
            queueMutation({ type: 'childList', target: parent, addedNodes: [next], removedNodes: [this] });
        }
        getBoundingClientRect() { return { top: this.top, bottom: this.top + (this.height ?? 20), height: this.height ?? 20, left: 0, right: 800, width: 800 }; }
        addEventListener() {}
        removeEventListener() {}
    }
    class MutationObserver {
        constructor(callback) { this.callback = callback; this.records = []; this.watches = []; this.queued = false; observers.push(this); }
        observe(target, options) { this.watches = this.watches.filter((watch) => watch.target !== target); this.watches.push({ target, options }); }
        disconnect() { this.watches.length = 0; this.records.length = 0; }
        takeRecords() { return this.records.splice(0); }
    }
    const root = new Element('monaco-editor'); root.rootConnected = true; root.height = 220;
    const toolbar = root.appendChild(new Element('toolbar'));
    let viewLines = root.appendChild(new Element('view-lines'));
    const rowFor = (lineNumber, row = visibleModelLines.indexOf(lineNumber)) => {
        const line = new Element('view-line', lineNumber, row * 20);
        line.appendChild(new Element('inline-folded', lineNumber, row * 20));
        return line;
    };
    const rows = new Map();
    for (const line of [2, 7, STATS_LINE]) rows.set(line, viewLines.appendChild(rowFor(line)));
    const handlers = new Map();
    const subscribe = (name) => (callback) => {
        const subscribers = handlers.get(name) ?? new Set(); handlers.set(name, subscribers); subscribers.add(callback);
        return { dispose() { subscribers.delete(callback); } };
    };
    const emit = (name) => { for (const callback of handlers.get(name) ?? []) callback({}); };
    let model = { getLineCount: () => lines, isDisposed: () => false };
    const editor = {
        getModel: () => model, getDomNode: () => root, getContainerDomNode: () => root,
        getVisibleRanges: () => model ? [
            { startLineNumber: 1, endLineNumber: 2 }, { startLineNumber: 6, endLineNumber: 7 },
            { startLineNumber: STATS_LINE - 1, endLineNumber: STATS_LINE },
            { startLineNumber: MILLION_LINES - 1, endLineNumber: MILLION_LINES },
        ] : [],
        getOption: () => 20,
        getTargetAtClientPoint(_x, y) {
            if (!hitTest) return null;
            const row = viewLines.children.find((line) => line.top <= y && y < line.top + 20);
            return row ? { position: { lineNumber: row.lineNumber } } : null;
        },
        getTopForLineNumber(lineNumber) {
            lineTopReads++;
            lineTopQueries.push(lineNumber);
            // Native Monaco projects hidden positions to the preceding visible model row.
            let row = 0;
            while (row + 1 < visibleModelLines.length && visibleModelLines[row + 1] <= lineNumber) row++;
            return row * 20;
        },
        onDidChangeModelContent: subscribe('content'), onDidChangeModel: subscribe('model'),
        onDidFocusEditorText: subscribe('focus'), onDidScrollChange: subscribe('scroll'),
        onDidChangeHiddenAreas: subscribe('hidden'), onDidDispose: subscribe('dispose'),
    };
    const index = { startLines: Uint32Array.from([2, 7, STATS_LINE]), counts: Uint32Array.from([3, 25385, 3]), types: Uint8Array.from([1, 2, 1]) };
    const module = { exports: {} };
    runInNewContext(bundle.outputFiles[0].text, {
        module, exports: module.exports, Element,
        document: { createElement: () => new Element() }, MutationObserver,
        setTimeout: (fn, delay = 0) => enqueue(fn, delay), clearTimeout: (id) => tasks.delete(id),
        requestAnimationFrame: (fn) => enqueue(fn, 16), cancelAnimationFrame: (id) => tasks.delete(id),
        Date: { now: () => clock },
    });
    module.exports.setupJsonFoldingInfoDisplay(editor, {
        getSummaryIndex: () => index, getOutputType: () => 'json', domObserverMaxLines: 300000,
    });
    const flush = () => {
        let rounds = 0;
        while (microtasks.length || tasks.size) {
            assert.ok(++rounds < 200, 'observer/RAF scheduling converges instead of updating itself forever');
            while (microtasks.length) microtasks.shift()();
            if (!tasks.size) continue;
            const [id, task] = [...tasks].sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
            tasks.delete(id); clock = task.at; task.fn();
        }
    };
    const text = (line) => rows.get(line)?.querySelector('.folding-info-text')?.textContent ?? null;
    const replaceRow = (line) => {
        const replacement = rowFor(line); rows.get(line).replaceWith(replacement); rows.set(line, replacement);
    };
    return {
        editor, root, toolbar, rows, emit, flush, text, replaceRow,
        get viewLines() { return viewLines; },
        counters: () => ({ lineTopReads, domScans, observerDeliveries, pendingTasks: tasks.size + microtasks.length }),
        lineTopQueries,
        watches: () => observers.flatMap((observer) => observer.watches),
        setModel(next) { model = next; emit('model'); },
        replaceViewLines() {
            const replacement = new Element('view-lines'); viewLines.replaceWith(replacement); viewLines = replacement;
            for (const [line] of rows) rows.set(line, viewLines.appendChild(rowFor(line)));
        },
        rowFor,
    };
};

test('a delayed stats row repaint restores its 3 keys after all folding timers settle', () => {
    const view = fixture(); view.flush();
    assert.equal(view.text(2), ' 3 keys');
    assert.equal(view.text(7), ' 25385 items');
    assert.equal(view.text(STATS_LINE), ' 3 keys');
    assert.equal(view.counters().pendingTasks, 0);
    view.replaceRow(STATS_LINE);
    assert.equal(view.text(STATS_LINE), null, 'Monaco replaces the view row and discards the injected span');
    view.flush();
    assert.equal(view.text(STATS_LINE), ' 3 keys', 'DOM repaint alone must restore the statistic without mouse or scroll events');
});

test('large-file observation is bounded to the visible line container', () => {
    const view = fixture(); view.flush();
    const watches = view.watches();
    assert.equal(watches.length, 1);
    assert.equal(watches[0].target, view.viewLines, 'the observer watches viewport DOM instead of the entire Monaco container');
    const before = view.counters();
    view.toolbar.appendChild(new (view.root.constructor)('inline-folded'));
    view.flush();
    assert.equal(view.counters().observerDeliveries, before.observerDeliveries);
    assert.equal(view.counters().domScans, before.domScans, 'unrelated editor chrome does not trigger folding scans');
});

test('inserting summary spans does not feed an observer and animation-frame loop', () => {
    const view = fixture(); view.flush();
    view.replaceRow(STATS_LINE); view.flush();
    assert.equal(view.text(STATS_LINE), ' 3 keys');
    assert.ok(view.counters().observerDeliveries <= 4, 'a replacement and its own appended span are the only meaningful deliveries');
    assert.equal(view.counters().pendingTasks, 0);
    for (const row of view.rows.values()) assert.equal(row.querySelectorAll('.folding-info-text').length, 1);
});

test('removing a folded marker removes its obsolete summary', () => {
    const view = fixture(); view.flush();
    view.rows.get(STATS_LINE).querySelector('.inline-folded').classList.remove('inline-folded');
    view.flush();
    assert.equal(view.text(STATS_LINE), null);
    assert.equal(view.text(2), ' 3 keys');
});

test('model transitions reconnect to the current line container and detach when no model remains', () => {
    const view = fixture(); view.flush();
    const oldContainer = view.viewLines;
    view.replaceViewLines();
    view.setModel({ getLineCount: () => MILLION_LINES * 2, isDisposed: () => false }); view.flush();
    assert.equal(view.watches().length, 1);
    assert.equal(view.watches()[0].target, view.viewLines);
    assert.ok(!view.watches().some((watch) => watch.target === oldContainer));
    view.replaceRow(STATS_LINE); view.flush();
    assert.equal(view.text(STATS_LINE), ' 3 keys');
    view.setModel(null); view.flush();
    assert.equal(view.watches().length, 0);
    assert.equal(view.text(STATS_LINE), null);
});

test('editor disposal disconnects observation and cancels queued redraws', () => {
    const view = fixture({ lines: 200000 }); view.flush();
    assert.equal(view.text(2), ' 3 keys');
    assert.equal(view.watches().length, 1);
    view.replaceRow(2);
    view.emit('dispose'); view.flush();
    assert.equal(view.watches().length, 0);
    assert.equal(view.counters().pendingTasks, 0);
    assert.equal(view.text(2), null, 'an already disposed editor cannot recreate the summary');
});

test('folding markers outside the viewport are ignored even when present in overscan DOM', () => {
    const view = fixture(); view.flush();
    const offscreen = view.rowFor(STATS_LINE); offscreen.top = 1000; offscreen.children[0].top = 1000;
    view.rows.get(STATS_LINE).replaceWith(offscreen); view.rows.set(STATS_LINE, offscreen);
    view.flush();
    assert.equal(view.text(STATS_LINE), null);
    assert.equal(view.text(2), ' 3 keys');
    assert.equal(view.text(7), ' 25385 items');
});

test('line-position fallback finds the visible stats row without walking a million hidden lines', () => {
    const view = fixture({ hitTest: false }); view.flush();
    assert.equal(view.text(2), ' 3 keys');
    assert.equal(view.text(7), ' 25385 items');
    assert.equal(view.text(STATS_LINE), ' 3 keys');
    assert.ok(view.counters().lineTopReads < 100, `fallback looks up only the visible rows, read count: ${view.counters().lineTopReads}`);
    assert.ok(view.lineTopQueries.every((line) => visibleModelLines.includes(line)), 'the native top lookup is never called for a hidden model position');
});
