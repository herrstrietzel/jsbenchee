//export * from './prototypes.js';
//export * from './benchmark_iframe.js';
//export * from './setup.js'

import { detectBrowser, addJSbencheeStyles } from './setup.js';
import { benchmarkScript, createReport} from './benchmark_iframe.js';


var JsBencheeCore = function ({
    tests = [],
    iterations = 25,
    target = '',
    render = false,
    agentDetection = false,
    exportMD = false,
    security = true,
    multipass = 1,
    multitask = true,
    includeColumns = [],
    addCSS = true,
    returnVar = ''
} = {}) {



    return new Promise(async (resolve) => {
        this.tests = tests;
        this.iterations = iterations;
        this.target = target;
        this.render = render;
        this.agentDetection = agentDetection;
        this.includeColumns = includeColumns;
        this.multipass = multipass;
        this.multitask = multitask;
        this.exportMD = exportMD;
        this.security = security;
        this.addCSS = addCSS;
        this.returnVar = returnVar;

        let agent = '';
        if (agentDetection) agent = detectBrowser();
        
        /**
         * merge object values
         * for multipass
         */
        const mergeObjectValues = (obj1, obj2) => {

            for (let key in obj1) {
                let value1 = obj1[key];
                let value2 = obj2[key];

                if (Array.isArray(value1)) {
                    obj1[key] = [...value1, ...value2]
                } else if (isNaN(value1)) {
                    //obj1[key] += `${value2}`
                } else {
                    obj1[key] = (value1 + value2) / 2
                }
            }

            return obj1

        }


        /**
         * benchmark
         */
        const startBenchmarks = async () => {
            if (addCSS) await addJSbencheeStyles();

            let reportWrap = null;
            let resultWrap = null;
            let benchmarkConclusion = null;
            let benchmarkMD = null;

            let info = agentDetection
                ? `<p class="jsBenchee-p"><strong>Agent:</strong> ${agent} <strong>Iterations:</strong> ${iterations}  <strong>Multipass:</strong> ${multipass} <strong>Multitask:</strong>${multitask}<p>`
                : `<p class="jsBenchee-p"><strong>Iterations:</strong> ${iterations}  <strong>Multipass:</strong> ${multipass} <strong>Multitask:</strong>${multitask}<p>`;

            let devToolsInfo = `<p class="jsBenchee-p"><strong>Note:</strong> It is recommended to close them while running benchmark test for more realistic results.<p>`;

            let scriptNames = tests.map(test => `»${test.name}«`).join(', ');
            let reportElMarkup = `
        <div class="jsBenchee-wrap">
            <p class="jsBenchee-heading">Benchmarking <strong>${scriptNames}</strong>
                <span class="jsBenchee-progress">– please wait 
                <svg class="icnSpinner jsBenchee-spinner" viewBox="0 0 100 100">
                    <path stroke="currentColor" stroke-linejoin="round" fill="none" d="M 50 10 a 40 40 0  1 1 -40 40">
                        <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 50 50;360 50 50" repeatCount="indefinite"></animateTransform></path>
                </svg>
            </span>
            </p>
            <section class="jsBenchee-section jsBenchee-summary">${info}${devToolsInfo}</section>
            <section class="jsBenchee-section jsBenchee-results"></section>
            <section class="jsBenchee-section jsBenchee-conclusion"></section>
            <details class="jsBenchee-details jsBenchee-markdown">
                <summary class="jsBenchee-summary">MD output</summary>
                <pre><code class="jsBenchee-md"></code></pre>
            </details>
        </div>`;

            // Parse report elements
            reportWrap = new DOMParser().parseFromString(reportElMarkup, 'text/html').querySelector('.jsBenchee-wrap');

            resultWrap = reportWrap.querySelector('.jsBenchee-results');
            benchmarkConclusion = reportWrap.querySelector('.jsBenchee-conclusion');
            benchmarkMD = reportWrap.querySelector('.jsBenchee-md');

            // Render report if necessary
            target = target && render ? document.querySelector(`${target}`) : null;

            if (render && !target) {
                let targetNew = document.createElement('article');
                targetNew.id = target.replace(/#|\./gi, '');
                target = targetNew;
            }

            if (render && target) {
                target.append(reportWrap);
            }

            multipass = multipass || 1;

            const iframeIDs = tests.map(() => crypto.randomUUID());

            for (let m = 0; m < multipass; m++) {
                if (multitask) {
                    let benchmarkPromises = tests.map((test, i) =>
                        benchmarkScript(test.scripts, test.name, iterations, security, jsBencheeScriptcache, iframeIDs[i], returnVar)
                            .catch(error => ({
                                name: test.name,
                                error: error.message,
                                average: 0,
                                iterations: [],
                                results: []
                            }))
                    );

                    const results = await Promise.allSettled(benchmarkPromises);

                    results.forEach(result => {
                        let benchmark = result.value;

                        if (m === 0) {
                            benchmarks.results.push(benchmark);
                        } else if (m > 0 && multipass > 1) {
                            let benchmarkPrev = benchmarks.results.find(bench => bench.name === benchmark.name);
                            mergeObjectValues(benchmarkPrev, benchmark);
                        }
                    });
                } else {
                    for (let i = 0, len = tests.length; len && i < len; i++) {
                        const { scripts, name } = tests[i];
                        const benchmark = await benchmarkScript(scripts, name, iterations, security, jsBencheeScriptcache, iframeIDs[i], returnVar);

                        if (m === 0) {
                            benchmarks.results.push(benchmark);
                        } else if (m > 0 && multipass > 1) {
                            let benchmarkPrev = benchmarks.results.find(bench => bench.name === benchmark.name);
                            mergeObjectValues(benchmarkPrev, benchmark);
                        }
                    }
                }
            }

            let { html, md } = createReport(benchmarks, includeColumns);

            //this.resultMd = md;
            //this.resultHtml = html;

            benchmarks.resultMd = md;
            benchmarks.resultHtml = html;
            benchmarks.resultsJSON = JSON.stringify({
                agent: agent,
                iterations: iterations,
                results: benchmarks.results
            });

            // update rendered state
            reportWrap.classList.add('jsBenchee-completed');

            if (render && target) {
                resultWrap.insertAdjacentHTML('beforeend', html);
                benchmarkMD.textContent = '\n' + md;
            }

            // clear jsBencheeScriptcache
            jsBencheeScriptcache = {};
        }



        // collect all benchmarks
        let benchmarks = {
            results: [],
            names: [...new Set(tests.map(test => test.name))],
            agent: agent,
            iterations: iterations,
            multipass: multipass,
            multitask: multitask,
            returnVar: returnVar
        };

        // Cache external scripts
        let jsBencheeScriptcache = {};

        // Run benchmark
        await startBenchmarks();

        // Resolve the result for async support
        resolve(benchmarks);


    });
}

// Export as default (for ESM)
// Named export (for ESM tree-shaking)
export { JsBencheeCore as jsBenchee };


// Self-executing function for IIFE
if (typeof window !== 'undefined') {
    window.jsBenchee = JsBencheeCore;
}
