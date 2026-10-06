import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const release = path.join(root, 'release');
fs.mkdirSync(release, { recursive: true });
const output = path.join(release, `json-tool-extension-${pkg.version}.zip`);
if (fs.existsSync(output)) fs.unlinkSync(output);
execFileSync('zip', ['-q', '-r', output, '.', '-x', '*.DS_Store'], { cwd: path.join(root, 'dist') });
console.log(`Extension package: ${output}`);

