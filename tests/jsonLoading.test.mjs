import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { scheduleIdleTask } from '../src/components/utils/idleTask.ts';
import { getJsonToolManualChunk } from '../scripts/vite/monaco-chunks.mjs';

const bundled = await build({ entryPoints: ['src/components/composables/useTabLifecycle.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const importLifecycle = () => import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text + `\n// ${Math.random()}`).toString('base64')}`);

function fakeStorage(records, calls) {
    const request = (result) => {
        const req = { result };
        queueMicrotask(() => req.onsuccess?.());
        return req;
    };
    const db = {
        objectStoreNames: { contains: (name) => records.has(name) },
        transaction: (name) => ({ objectStore: () => ({
            getAll() {
                calls.push(['getAll', name]);
                assert.equal(name, 'tabHeartbeats', 'GC must never clone archive or Diff bodies');
                return request([...records.get(name).values()]);
            },
            getAllKeys() { calls.push(['getAllKeys', name]); return request([...records.get(name).keys()]); },
            delete(key) { records.get(name).delete(key); return request(); },
            put(value) { records.get(name).set(value.tabId, value); return request(); },
        }) }),
    };
    return { open: () => request(db) };
}

test('GC reads only keys for large bodies, preserves live tabs, removes expired and orphan tabs', async (t) => {
    const calls=[];
    const fresh=Date.now(), stale=fresh-600_000;
    const records=new Map([
        ['tabHeartbeats', new Map(['current','fresh','live','closed'].map(tabId=>[tabId,{tabId,updatedAt:tabId==='closed'||tabId==='live'?stale:fresh}]))],
        ['archivesByTab', new Map(['current','fresh','live','closed','orphan'].map(tabId=>[tabId,{tabId,body:'large archive body'}]))],
        ['diffDraftByTab', new Map(['current','fresh','live','closed','orphan'].map(tabId=>[tabId,{tabId,body:'large Diff body'}]))],
    ]);
    t.mock.method(globalThis, 'setTimeout', (fn) => { queueMicrotask(fn); return 1; });
    const original={window:globalThis.window,indexedDB:globalThis.indexedDB,BroadcastChannel:globalThis.BroadcastChannel};
    globalThis.window={};globalThis.indexedDB=fakeStorage(records,calls);
    globalThis.BroadcastChannel=class {
        addEventListener(_type,fn){this.listener=fn;}
        removeEventListener(){} close(){}
        postMessage(message){if(message.tabId==='live')this.listener({data:{type:'tab-alive-pong',tabId:'live',requesterInstanceId:'test',responderInstanceId:'other'}});}
    };
    t.after(()=>Object.assign(globalThis,original));
    const {useTabLifecycle}=await importLifecycle();
    const lifecycle=useTabLifecycle({tabId:{value:'current'},runtimeInstanceId:'test',isTabPageClosing:{value:false}});
    lifecycle.setupTabGcChannel();
    await lifecycle.garbageCollectClosedTabs();
    for(const store of records.values())assert.deepEqual([...store.keys()].sort(),['current','fresh','live']);
    assert(records.get('tabHeartbeats').get('live').updatedAt>=fresh);
    assert.deepEqual(calls.sort(),[['getAll','tabHeartbeats'],['getAllKeys','archivesByTab'],['getAllKeys','diffDraftByTab']].sort());
    lifecycle.disposeTabGcChannel();
});

test('GC stops if the page unmounts during a liveness probe', async (t) => {
    const closing={value:false}; const calls=[];
    const records=new Map(['tabHeartbeats','archivesByTab','diffDraftByTab'].map(name=>[name,new Map([['closed',{tabId:'closed',updatedAt:0}]])]));
    const original={window:globalThis.window,indexedDB:globalThis.indexedDB,BroadcastChannel:globalThis.BroadcastChannel};
    globalThis.window={};globalThis.indexedDB=fakeStorage(records,calls);
    globalThis.BroadcastChannel=class {addEventListener(){}removeEventListener(){}close(){}postMessage(){closing.value=true;}};
    t.mock.method(globalThis,'setTimeout',(fn)=>{queueMicrotask(fn);return 1;});
    t.after(()=>Object.assign(globalThis,original));
    const {useTabLifecycle}=await importLifecycle();
    const lifecycle=useTabLifecycle({tabId:{value:'current'},runtimeInstanceId:'test',isTabPageClosing:closing});
    lifecycle.setupTabGcChannel(); await lifecycle.garbageCollectClosedTabs();
    for(const store of records.values())assert(store.has('closed'));
    lifecycle.disposeTabGcChannel();
});

test('idle cleanup can be cancelled with and without requestIdleCallback', (t) => {
    const original=globalThis.window; t.after(()=>{globalThis.window=original;});
    let callback, cancelledHandle, runs=0;
    globalThis.window={requestIdleCallback(fn){callback=fn;return 42;},cancelIdleCallback(id){cancelledHandle=id;}};
    scheduleIdleTask(()=>runs++)();callback();assert.equal(runs,0);assert.equal(cancelledHandle,42);
    scheduleIdleTask(()=>runs++);callback();assert.equal(runs,1);
    globalThis.window={setTimeout(fn){callback=fn;return 7;},clearTimeout(id){cancelledHandle=id;}};
    scheduleIdleTask(()=>runs++)();callback();assert.equal(runs,1);assert.equal(cancelledHandle,7);
    delete globalThis.window;scheduleIdleTask(()=>runs++)();assert.equal(runs,1);
});

test('Monaco core keeps optional language mode chunks lazy', () => {
    assert.equal(getJsonToolManualChunk('/node_modules/monaco-editor/esm/vs/editor/editor.api.js'),'monaco-core');
    assert.equal(getJsonToolManualChunk('/node_modules/monaco-editor/esm/vs/language/json/monaco.contribution.js'),'monaco-core');
    assert.equal(getJsonToolManualChunk('/node_modules/monaco-editor/esm/vs/language/json/jsonMode.js'),undefined);
    assert.equal(getJsonToolManualChunk('/node_modules/monaco-editor/esm/vs/basic-languages/yaml/yaml.js'),undefined);
    assert.equal(getJsonToolManualChunk('\0vite/preload-helper.js'),'module-runtime');
    assert.equal(getJsonToolManualChunk('/src/components/JsonToolWorkbench.client.vue'),undefined);
});
