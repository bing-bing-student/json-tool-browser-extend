import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { getSourceInfo, sha256 } from './package-info.mjs';

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(import.meta.dirname, '..');
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public/manifest.json'), 'utf8'));
    const filename = `json-tool-extension-${pkg.version}.zip`;
    const info = JSON.parse(fs.readFileSync(path.join(root, 'release', filename.replace(/\.zip$/, '.build-info.json')), 'utf8'));
    assert.equal(info.version, pkg.version, '安装包版本与 package.json 不一致');
    assert.equal(info.version, manifest.version, '安装包版本与 manifest.json 不一致');
    assert.equal(info.extensionName, manifest.name, '安装包名称与 manifest.json 不一致');
    assert.equal(info.sourceSha256, getSourceInfo(root).sourceSha256, '源码或构建配置已修改，安装包已过期，请重新运行 npm run package');
    const zip = fs.readFileSync(path.join(root, 'release', filename));
    assert.equal(info.packageSha256, sha256(zip), 'ZIP 校验值不一致，文件已被修改或损坏，请重新打包');
    assert.equal(info.packageBytes, zip.length, 'ZIP 文件大小与构建记录不一致');
    console.log(`Package verified: ${filename}`);
    console.log(`Built at: ${info.builtAt}`);
    console.log(`Git commit: ${info.gitCommit ?? 'unavailable'}${info.gitWorkingTreeDirty ? ' (with local changes)' : ''}`);
    console.log(`SHA-256: ${info.packageSha256}`);
} catch (error) {
    console.error('Package verification failed:', error.message);
    process.exitCode = 1;
}
