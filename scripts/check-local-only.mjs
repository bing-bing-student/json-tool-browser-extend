import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
for (const key of ['permissions', 'host_permissions', 'optional_host_permissions', 'content_scripts']) {
    assert.ok(!manifest[key]?.length, `Unexpected extension capability: ${key}`);
}
assert.match(manifest.content_security_policy.extension_pages, /connect-src 'self'/);
const removed = /\b(?:FetchJsonDialog|ShareDialog|BugFeedbackDialog|useClientGuard|useRuntimeConfig|useNuxtApp|navigateTo|\$fetch)\b|\/api(?:-backend)?\/|liubing\.xyz|~\//;
const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filename) : [filename];
});
for (const filename of walk(path.join(root, 'src'))) {
    assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), removed, `Online/blog dependency in ${filename}`);
}
for (const filename of walk(path.join(root, 'dist')).filter((name) => /\.(?:html|js)$/.test(name))) {
    assert.doesNotMatch(fs.readFileSync(filename, 'utf8'), /\/api\/share-json|\/api\/fetch-json|api-backend|guard_core|liubing\.xyz/, `Online dependency in bundle ${filename}`);
}
for (const filename of [manifest.background.service_worker, 'index.html', ...Object.values(manifest.icons)]) {
    assert.ok(fs.existsSync(path.join(root, 'dist', filename)), `Missing extension resource: ${filename}`);
}
console.log('Local-only check passed: no blog APIs, remote features, host permissions or content scripts.');

