import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { getSourceInfo } from './package-info.mjs';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'dist/manifest.json'), 'utf8'));
if (pkg.version !== manifest.version) throw new Error('package.json 与 manifest.json 的版本号不一致');
const git = (args) => {
    try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return null; }
};
const status = git(['status', '--porcelain']);
const info = {
    schemaVersion: 1,
    extensionName: manifest.name,
    version: manifest.version,
    builtAt: new Date().toISOString(),
    gitCommit: git(['rev-parse', 'HEAD']),
    gitWorkingTreeDirty: status === null ? null : status.length > 0,
    nodeVersion: process.version,
    ...getSourceInfo(root),
};
fs.writeFileSync(path.join(root, 'dist/build-info.json'), JSON.stringify(info, null, 2) + '\n');
console.log(`Build record written: ${info.version}, source ${info.sourceSha256.slice(0, 12)}`);
