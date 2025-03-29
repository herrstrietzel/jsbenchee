
import terser from '@rollup/plugin-terser';
const libName = 'jsBenchee';

export default [
    // IIFE Build
    {
        input: 'src/index.js',
        output: [
            {
                file: `dist/${libName}.js`,
                format: 'iife',
                name: libName,
                extend: true,
                exports: 'named'
            },
            {
                file: `dist/${libName}.min.js`,
                format: 'iife',
                name: libName,
                extend: true,
                exports: 'named',
                plugins: [terser()]
            },
        ]
    },
    // ESM Build
    {
        input: 'src/index.js',
        output: [
            {
                file: `dist/${libName}.esm.js`,
                format: 'es',
                exports: 'named',
            },
            {
                file: `dist/${libName}.esm.min.js`,
                format: 'es',
                exports: 'named',
                plugins: [terser()]
            },
        ]
    }
];