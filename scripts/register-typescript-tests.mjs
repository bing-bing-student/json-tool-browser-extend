import { register } from 'node:module';

// Node 20 supports module hooks but cannot run TypeScript sources natively.
register('./typescript-test-loader.mjs', import.meta.url);
