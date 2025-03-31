
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
                plugins: [terser({
                    format: {
                      beautify: false,
                      preserve_annotations: false,
                    },
                    compress: {
                      defaults: true,
                      inline: true,
                      reduce_vars: true,
                      unused: true,
                      hoist_funs: true,
                      passes: 2, 
                      drop_console: true,
                    },
                    mangle: {
                      // Mangle variable names (smaller output)
                      toplevel: true,
                    },
                  }),]
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