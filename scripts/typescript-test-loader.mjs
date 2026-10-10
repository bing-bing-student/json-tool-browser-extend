import { readFile, stat } from 'node:fs/promises';
import { transform } from 'esbuild';

export async function resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
        const url = new URL(specifier, context.parentURL);
        if (!/\.[^/]+$/.test(url.pathname)) {
            const candidate = new URL(url.href + '.ts');
            try {
                if ((await stat(candidate)).isFile()) return { url: candidate.href, shortCircuit: true };
            } catch (error) {
                if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
            }
        }
    }
    return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
    if (url.startsWith('file:') && new URL(url).pathname.endsWith('.ts')) {
        const result = await transform(await readFile(new URL(url), 'utf8'), {
            loader: 'ts', format: 'esm', target: 'es2022', sourcefile: new URL(url).pathname,
            sourcemap: 'inline',
        });
        return { format: 'module', source: result.code, shortCircuit: true };
    }
    return nextLoad(url, context);
}
