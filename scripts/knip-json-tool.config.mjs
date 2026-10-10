import { createRequire } from 'node:module';

const { parse } = createRequire(import.meta.url)('vue/compiler-sfc');

// Report candidates only. Template refs and runtime entry points still need review.
export default {
    entry: [
        'src/main.ts',
        'src/App.vue',
        // Keep template components as explicit roots to avoid false positives.
        'src/components/*.vue',
        // Workers and tests must remain reachable even when their paths are runtime strings.
        'src/components/workers/*.worker.ts',
        'tests/*.test.mjs',
    ],
    project: ['src/components/**/*.{ts,vue}', 'src/utils/jsonTool*.ts'],
    paths: { '@/*': ['./src/*'] },
    // Explicit roots keep this audit scoped to the JSON tool without evaluating build config.
    nuxt: false,
    vite: false,
    include: ['files', 'exports', 'types', 'unresolved'],
    ignoreExportsUsedInFile: true,
    compilers: {
        vue: (source, filename) => {
            const { descriptor, errors } = parse(source, { filename, sourceMap: false });
            if (errors.length) throw new Error(`Cannot scan ${filename}: ${errors.join('; ')}`);
            return [descriptor.script, descriptor.scriptSetup]
                .filter(Boolean)
                .map(block => block.src ? `import '${block.src}';` : block.content)
                .join('\n');
        },
    },
};
