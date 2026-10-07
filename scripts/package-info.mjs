import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const sha256 = (content) => createHash('sha256').update(content).digest('hex');

export const getSourceInfo = (root) => {
    const files = [];
    const visit = (relative) => {
        const absolute = path.join(root, relative);
        for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
            if (entry.name === '.DS_Store') continue;
            const next = path.posix.join(relative, entry.name);
            if (entry.isDirectory()) visit(next);
            else if (entry.isFile()) files.push(next);
        }
    };
    for (const directory of ['src', 'public', 'scripts']) visit(directory);
    for (const name of fs.readdirSync(root)) {
        if (/^(?:package(?:-lock)?\.json|index\.html|vite\.config\.[^/]+|tsconfig[^/]*\.json)$/.test(name)) files.push(name);
    }
    files.sort();
    const hash = createHash('sha256');
    for (const relative of files) {
        hash.update(relative + '\0');
        hash.update(sha256(fs.readFileSync(path.join(root, relative))) + '\n');
    }
    return { sourceSha256: hash.digest('hex'), sourceFileCount: files.length };
};
