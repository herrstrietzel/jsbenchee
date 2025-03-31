import { detectBrowser, addJSbencheeStyles } from './setup.js';
import { benchmarkScript, createReport } from './benchmark_iframe.js';


var JsBencheeCore = function ({
    tests = [],
    iterations = 25,
    target = '',
    render = true,
    agentDetection = false,
    security = true,
    multitask = true,
    includeColumns = [],
    addCSS = true,
    returnVar = ''
} = {}) {

    this.settings = { tests, iterations, target, render, agentDetection, includeColumns, multitask, security, addCSS, returnVar }

    // lib prefix just for CSS compression
    const lb = 'jsBenchee';
    const agent = agentDetection ? detectBrowser() : '';

    // auto naming
    tests.map(test=>{
        if(!test.name)  {
            let urls = test.scripts.filter(scr=>{return scr.includes('http')})
            try{
                if(urls.length){
                    let url = urls[0].match(/(https?:\/\/[^\s]+)/)[0].split('/').filter(Boolean).slice(2)
                    test.name = url.sort((a, b) =>  b.length - a.length )[0];
                }
            } catch{
                test.name = 'undefined'
            }   
        }
    });


    // collect all benchmarks
    let benchmarks = {
        results: [],
        names: [...new Set(tests.map((test,i) => test.name))],
        settings: this.settings
    };

    // Cache external scripts
    let jsBencheeScriptcache = {};


    /**
     * create report wrap
     */
    const getReportWrap = (agent = '', iterations = 0, agentDetection = false, multitask = false, tests = []) => {

        let info = `<strong>Iterations:</strong> ${iterations} Multitask:</strong>${multitask}`
        info = agentDetection ? `<strong>Agent:</strong> ${agent} <strong>` + info : info;

        let scriptNames = tests.map(test => `»${test.name}«`).join(', ');
        let reportElMarkup = `
        <div class="${lb}-wrap">
            <p class="${lb}-heading">Benchmarking <strong>${scriptNames}</strong>
                <span class="${lb}-progress">– please wait <span class="${lb}-progress-spinner"></span>
            </span>
            </p>
            <div class="${lb}-section ${lb}-summary">
            <p class="${lb}-p"> ${info}</p>
            <p class="${lb}-p"><strong>Note:</strong> It is recommended to close them while running benchmark test for more realistic results.</p>
            </div>
            <div class="${lb}-section ${lb}-results"></div>
            <details class="${lb}-details ${lb}-markdown">
                <summary class="j${lb}-summary">MD output</summary>
                <textarea class="${lb}-textarea" readonly></textarea>
            </details>
        </div>`;

        // Parse report elements
        let reportWrap = new DOMParser().parseFromString(reportElMarkup, 'text/html').querySelector(`.${lb}-wrap`),
            resultWrap = reportWrap.querySelector(`.${lb}-results`),
            benchmarkMD = reportWrap.querySelector(`.${lb}-textarea`);

        return { reportWrap: reportWrap, resultWrap: resultWrap, benchmarkMD: benchmarkMD }

    }


    /**
     * run benchmarks
     */
    const startBenchmarks = async () => {

        let reportWrap, resultWrap, benchmarkMD;

        // get report wrap
        if (render) {
            ({ reportWrap, resultWrap, benchmarkMD } = getReportWrap(agent, iterations, agentDetection, multitask, tests));

            // Render report if necessary
            target = target && render ? document.querySelector(`${target}`) : null;

            // no target selector defined
            if (!target) {
                let targetNew = document.createElement('article');
                targetNew.id = 'jsBencheeReport';
                target = targetNew;
                document.body.append(target);
            }
            target.append(reportWrap);
        }


        const iframeIDs = tests.map(() => crypto.randomUUID());


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
                benchmarks.results.push(benchmark);
            });
        } else {
            for (let i = 0, len = tests.length; len && i < len; i++) {
                const { scripts, name } = tests[i];
                const benchmark = await benchmarkScript(scripts, name, iterations, security, jsBencheeScriptcache, iframeIDs[i], returnVar);
                benchmarks.results.push(benchmark);
            }
        }


        let { html, md } = createReport(benchmarks, includeColumns);

        benchmarks.resultMd = md;
        benchmarks.resultHtml = html;
        benchmarks.resultsJSON = JSON.stringify({
            agent: agent,
            iterations: iterations,
            results: benchmarks.results
        });

        // update rendered state
        if (render) {
            reportWrap.classList.add(`${lb}-completed`);
            resultWrap.insertAdjacentHTML('beforeend', html);
            benchmarkMD.value = '\n' + md;
        }

        // clear jsBencheeScriptcache
        jsBencheeScriptcache = {};
    }


    /**
     * start the actual tests
     * collect data in benchmarks object
     */

    return new Promise(async (resolve) => {

        // add report stylesheet
        if (addCSS && render) await addJSbencheeStyles();

        // Run benchmark
        await startBenchmarks();

        // Resolve the result for async support
        resolve(benchmarks);


    });
}

export { JsBencheeCore as jsBenchee };


// Self-executing function for IIFE
if (typeof window !== 'undefined') {
    window.jsBenchee = JsBencheeCore;
}
