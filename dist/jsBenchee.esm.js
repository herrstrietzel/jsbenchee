/**
 * browser sniffing is evil but
 * helpful for benchmarking
 */
function detectBrowser() {
    let info = '', brands = [], browser = '', platform = '';


    if (navigator.userAgentData) {
        ({ brands, platform } = navigator.userAgentData);
        browser = brands.slice(-1)[0];
        info = `${browser.brand}/${browser.version} ${platform}`;
    }
    else if (navigator.userAgent) {
        let agentDesc = navigator.userAgent.split(' ');
        browser = agentDesc.slice(-1)[0];
        platform = agentDesc[1].replace(/\(/g, '');
        info = `${browser} ${platform}`;
    }
    return info;
}


async function addJSbencheeStyles() {


    const currentScriptPath=function(level=1){
        let url = '';
        try{
            let line=(new Error()).stack.split('\n')[level+1].split('@').pop();
            var regex = /\(([^()]*)\)/g;
            url = Array.from(line.matchAll(regex))[0][1].split('/').slice(0,-1).join('/');

        }catch{
            console.log('could not parse path');
        }
        return url
    };


    let url = currentScriptPath()+'/jsBenchee.css';
    let res = await (fetch(url));

    if (res.ok) {
        let css = await (res).text();
        let styleEl = document.getElementById('jsBencheeStyles');
        if (!styleEl) {
            styleEl = document.createElement('style');
            styleEl.textContent = css;
            document.head.append(styleEl);
        }
    }
}

async function benchmarkScript(scripts = [], name = '', iterations = 25, security = true, jsBencheeScriptcache = {}, iframeID = '', returnVar = '') {

    /**
     * collect timing data
     */
    let results = {
        name: name,
        average: 0,
        lowest: 0,
        highest: 0,
        timings: [],
    };


    // create unique iframe ID
    //const iframeID = crypto.randomUUID();
    let iframe = document.getElementById(iframeID);
    let isCached = jsBencheeScriptcache[iframeID];
    let externalScripts = [], inlineScripts = [], moduleScripts = [];
    let moduleScriptContent = '', externalScriptContent = '', inlineScriptsContent = '';
    let tries = 0;


    /**
     * check if scripts require 
     * fetching/inlining of external resources
     * skip if iframe isn't already chached
     */
    if (!isCached) {

        /**
         * collect info about 
         * external or module script 
         * dependancies
         */
        for (let i = 0, len = scripts.length; len && i < len; i++) {
            let script = scripts[i];
            let ext = script.split('.')?.slice(-1)[0] || null;
            let hasJsExt = ext ? ext === 'js' || ext === 'cjs' || ext === 'mjs' : false;
            let hasUrl = script.startsWith('https://') || script.startsWith('http://') || script.startsWith('//');
            let isModule = script.includes('import');
            let riskScore = 0;

            if (isModule) {
                moduleScripts.push(script);
            } else {
                if (hasJsExt || hasUrl) {
                    externalScripts.push(script);
                } else {

                    if (security) {
                        // detect risks
                        riskScore = detectUnsafeCode(script);
                        if (riskScore > 1) {
                            //throw new Error("Potentially malicious script detected");
                            script = `const jsBencheeHarmful=true`;
                        }
                    }
                    //console.log('security', security, riskScore);
                    inlineScripts.push(script);
                }
            }
        }


        /**
         * compile script chunks
         * for iframe
         */

        // 1. module scripts - requires inlining
        moduleScriptContent = await generateScriptBlocks(moduleScripts, iframeID, 'module', security, returnVar);


        // 2. Fetch external scripts an prepend them in head before inline scripts
        externalScriptContent = await generateScriptBlocks(externalScripts, iframeID, 'external', security, returnVar);


        // 3. inline scripts
        inlineScriptsContent = await generateScriptBlocks(inlineScripts, iframeID, '', security, returnVar);
    }


    /**
     * create benchmark iframe
     */
    const createBenchmarkIframe = async (moduleScriptContent = '', externalScriptContent = '', inlineScriptsContent = '', jsBencheeScriptcache = {}, iframeID = '') => {
        if (!iframe) {
            iframe = document.createElement('iframe');
            iframe.id = iframeID;
            iframe.style.display = 'none';
            iframe.sandbox = 'allow-scripts';
            document.body.append(iframe);
        }

        let dataUrl = '';

        // is cached
        if (jsBencheeScriptcache[iframeID]) {
            dataUrl = jsBencheeScriptcache[iframeID];
            //console.log('is cached', iframeID);
        } else {

            let iframeContent = `<!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                ${externalScriptContent}
            <\/head>
            <body>
                ${moduleScriptContent}
                ${inlineScriptsContent}
            <\/body>
            <\/html>`;

            dataUrl = `data:text/html,${encodeURIComponent(iframeContent)}`;
            jsBencheeScriptcache[iframeID] = dataUrl;
        }

        iframe.src = dataUrl;

    };


    // start benchmarking
    return new Promise((resolve) => {

        window.addEventListener('message', function listener(event) {

            let { benchmarkResult, error, value } = event.data;
            let hasBenchmarks = event.data.hasOwnProperty('benchmarkResult');
            let eventID = event.data.ID;
            let isSame = eventID === iframeID;


            // script has errors
            if (error) {
                // Final result
                results.error = error;
                resolve(results);
            }

            else if (isSame && event.data && hasBenchmarks) {


                // return result value
                if (returnVar && value) {
                    //console.log('returnVar', returnVar);
                    value = typeof value === 'object' ? (!Array.isArray(value) ? JSON.stringify(value) : value) : value;
                    //console.log('value', value);
                    results.value = value;
                }


                results.timings.push(benchmarkResult);
                tries++;

                // test new iframe instance
                if (tries < iterations) {
                    createBenchmarkIframe(moduleScriptContent, externalScriptContent, inlineScriptsContent, jsBencheeScriptcache, iframeID);

                } else {
                    window.removeEventListener('message', listener);

                    let timings = [...results.timings].sort((a, b) => a - b);
                    results.lowest = +timings[0].toFixed(3);

                    //let average = timings.reduce((a, b) => a + b, 0) / timings.length;
                    let average = timings.reduce((a, b) => a + b, 0) / timings.length;
                    //results.average = +average.toFixed(3);
                    results.average = average;

                    // check higest values for more realistic average
                    let highest = timings.reverse();

                    // compensate not realistic extreme peaks
                    let peak = highest[0];

                    if (peak > average * 2) {

                        // remove extreme peak
                        results.timings.splice(results.timings.indexOf(peak), 1);
                        highest.shift();
                        peak = highest[0];

                        average = results.timings.reduce((a, b) => a + b, 0) / results.timings.length;
                        results.average = +average.toFixed(9);
                    }


                    // add results to object
                    results.highest = +peak.toFixed(3);
                    results.timings = [...results.timings];


                    // Final result
                    resolve(results);

                    // clear cache
                    iframe.contentWindow.location.replace('about:blank');
                    performance.clearResourceTimings();
                    performance.clearMarks();
                    performance.clearMeasures();

                    //objectURL = URL.revokeObjectURL(objectURL);

                    // remove iframe
                    iframe.remove();

                }
            }
        });

        // Start the first iteration
        createBenchmarkIframe(moduleScriptContent, externalScriptContent, inlineScriptsContent, jsBencheeScriptcache, iframeID);

    }
    );

}



/**
 * generate script blocks
 * for temporary benchmarkiframe
 */

async function generateScriptBlocks(scripts = [], iframeID = '', type = '', security = true, returnVar = '') {





    /**
     * convert external script
     * to dataURL
     * apply basic security check
     */
    const externalScriptsToDataUrl = async (url, security = true) => {
        let dataUrl = '';
        let res = await fetch(url);
        if (res.ok) {
            let script = await res.text();

            // detect risks
            if (security) {
                let riskScore = detectUnsafeCode(script);
                if (riskScore > 1) {
                    //throw new Error("Potentially malicious script detected");
                    script = `const jsBencheeHarmful=true`;
                }
            }

            // Convert the module code to a data URL
            dataUrl = `data:text/javascript,${encodeURIComponent(script)}`;
        }
        return dataUrl;
    };


    /**
     * get module dependancies 
     * and inline them as dataURLs
     */
    const inlineModuleImports = async (scriptCode, security = true) => {

        // Regex to match import statements
        let importRegex = /import\s+(.*?)\s+from\s+['"](.*?)['"]/g;

        // Find all import statements in the script code
        let imports = Array.from(scriptCode.matchAll(importRegex));
        let inlinedImports = [];

        for (let i = 0, len = imports.length; len && i < len; i++) {
            let [match, name, url] = imports[i];
            let dataUrl = await externalScriptsToDataUrl(url, security);
            let newImport = match.replaceAll(url, dataUrl);
            inlinedImports.push(`${newImport}`);
        }

        // Return the imports and body as separate properties
        let body = scriptCode.replace(importRegex, '').replaceAll(';', '').trim();

        return {
            imports: inlinedImports,
            body: body,
        };
    };



    let scriptmarkup = '';
    let strictMarkup = !type ? `"use strict";\n` : '';
    let scriptContent = '';
    let importContent = '';
    let externalScriptContent = '';
    let typeAtt = type ? `type="${type}" ` : type;

    if (!scripts.length) return '';

    // module scripts
    if (type && type !== 'external') {
        //console.log('reg', scriptContent);
        for (let i = 0; i < scripts.length; i++) {
            let script = scripts[i];
            // inline import dependencies
            let moduleScript = await inlineModuleImports(script, security);
            let { imports, body } = moduleScript;
            importContent += imports.length ? imports.join('\n') : '';
            scriptContent += body ? body + `\n` : '';
        }

    }

    // external script dependencies
    else if (type && type === 'external') {
        //console.log('reg', scriptContent);
        for (let i = 0; i < scripts.length; i++) {
            let url = scripts[i];
            // inline import dependencies
            let dataUrl = await externalScriptsToDataUrl(url, security);
            externalScriptContent += `<script src="${dataUrl}" defer><\/script>\n`;
        }
    }

    // inline scripts
    else {
        scriptContent = scripts.join('\n');
        //console.log('module', importContent);
    }

    let returnVarPost = returnVar ?
        `if(typeof ${returnVar} !== 'undefined'){
        returnValue = ${returnVar} ? ${returnVar} : "";
    }\n` :
        '';

    scriptmarkup +=
        `
        ${externalScriptContent}
        <script ${typeAtt}>
        ${importContent}
        ${strictMarkup}
        const iframeID = '${iframeID}';
        // disable alerts
        window.alert = () => ()=>{let noalert=''};
        window.addEventListener('load', () => {
            const winOrigin = document.referrer;
            let returnValue = '';
            try {
                let duration = 0;
                const start = performance.now();
                ${scriptContent};
                duration = performance.now() - start;
                ${returnVarPost}
                parent.postMessage({ benchmarkResult: duration, value:returnValue, ID:iframeID, winOrigin: winOrigin}, '*');

            } catch (err) {
                parent.postMessage({ error: err.message }, '*');
            }
        });
    <\/script>`;

    return scriptmarkup;
}




/**
 * detect highly suspicious code
 */
function detectUnsafeCode(script) {

    const patterns = [
        { regex: /eval\s*\(/g, score: 1 },
        { regex: /new\s+Function\s*\(/g, score: 1 },
        { regex: /setTimeout\s*\(/g, score: 0.1 },
        { regex: /setInterval\s*\(/g, score: 0.1 },
        { regex: /document\.write\s*\(/g, score: 0.5 },
        { regex: /innerHTML\s*=/g, score: 0.3 }
    ];

    let riskScore = 0;
    const matches = {};

    // Track occurrences of each pattern
    patterns.forEach(({ regex, score }) => {
        const found = [...script.matchAll(regex)];
        if (found.length) {
            matches[regex] = found.length;
            riskScore += found.length * score;
        }
    });

    // Combination Penalty for eval + setTimeout
    if ((matches[/eval\s*\(/g] || matches[/new\s+Function\s*\(/g]) && matches[/setTimeout\s*\(/g]) {
        riskScore += 2;  // Heavily suspicious pattern combo
    }

    // Combination Bonus for eval + document.write/innerHTML
    if ((matches[/eval\s*\(/g] || matches[/new\s+Function\s*\(/g]) &&
        (matches[/document\.write\s*\(/g] || matches[/innerHTML\s*=/g])) {
        riskScore += 1;
    }

    //return { riskScore: +riskScore.toFixed(2), matches };
    return +riskScore.toFixed(2);
}



/**
 *  render report
 */

function createReport(benchmarks, includeColumns = []) {

    /**
     * filter result properties
     */

    const filterObjectProperties = (data, includeColumns = []) => {

        if (!includeColumns.length) return data;

        return data.map(item => {
            const filteredItem = {};

            // If no includeColumns specified, include all properties
            const keysToInclude = includeColumns && includeColumns.length
                ? includeColumns
                : Object.keys(item);

            keysToInclude.forEach(key => {
                if (item.hasOwnProperty(key)) {
                    filteredItem[key] = item[key];
                }
            });

            return filteredItem;
        });
    };


    let { results, agent = '', names, iterations, multipass, multitask } = benchmarks;

    // sort by average
    results.sort((a, b) => a.average - b.average);
    let invalid = '';

    // invalid result - remove
    if (results[0].average === 0) {
        invalid += `»${results[0].name}« could not be benchmarked`;
        results.shift();
    }


    let table = '';
    table += '<table class="jsBenchee-table">';

    // filter if specified
    if (includeColumns.length) results = filterObjectProperties(results, includeColumns);


    // create table header
    table += `<thead class="jsBenchee-thead">\n<tr class="jsBenchee-tr">`;
    let thLabels = Object.keys(results[0]);
    table += thLabels.map(th => { return `<th class="jsBenchee-th">${th}</th>` }).join('\n');
    // close table head
    table += `</tr>\n</thead>`;

    // markdown
    let tableMd = '';

    tableMd += `**Scripts:** ${names.join(', ')}  \n`;
    tableMd += agent ? `**Agent:** ${agent} ` : '';
    tableMd += multipass ? `**Multipass:** ${multipass} ` : '';
    tableMd += multitask ? `**Multitask:** ${multitask} ` : '';
    tableMd += `**Iterations:** ${iterations} \n\n`;

    tableMd += '| ' + thLabels.map((th, i) => { return `${th} | ` }).join(' ') + '\n';
    tableMd += '| ' + thLabels.map((th, i) => { return i === 0 ? `:--- | ` : `---: | ` }).join(' ') + '\n';

    // create table body
    table += `<tbody class="jsBenchee-tbody">`;

    results.forEach((result, i) => {

        // add new row for each script
        table += `<tr class="jsBenchee-tr">`;
        tableMd += '| ';

        // add property values
        for (let key in result) {

            let vals = result[key];
            vals = Array.isArray(vals) ? vals.map(val => { return (val && !isNaN(val) ? +val.toFixed(3) : val) }).join(', ') : vals;


            if (!isNaN(vals) && vals) {
                vals = key === 'average' ? +vals.toFixed(1) : +vals.toFixed(3);
            }

            table += `<td class="jsBenchee-td"><span class="jsBenchee-td-label">${key}:</span> <span class="jsBenchee-td-value">${vals}</span></td>`;
            tableMd += ` ${vals} | `;

        }

        table += `</tr>`;
        tableMd += '\n';

    });

    table += `</tbody>`;
    table += '</table>';


    /**
     * add summary
     */
    // compare - get lowest value/fastest script
    results.sort((a, b) => a.average - b.average);
    let fastest = results[0];
    let fastestAverage = +fastest.average.toFixed(3);

    let len = results.length;
    let summary = '<ul class="jsBenchee-ul">';
    let summaryMd = '';


    // compare multiple scripts
    for (let i = 0; len && i < len; i++) {
        let bench = results[i], rat = 1;
        let { name, average, timings } = bench;
        let feedback = '';

        if (i === 0) {
            feedback = `»${fastest.name}« is the fastest executing with an average of ${fastestAverage} ms`;
        } else {
            rat = +(average / fastestAverage).toFixed(3);
            let perc = +((rat - 1) * 100).toFixed(0);
            feedback = `»${name}« is ~ ${rat} times / ~ ${perc}% slower than »${fastest.name}«`;
        }
        summary += `<li class="jsBenchee-li">${feedback}</li>`;
        summaryMd += `* ${feedback}  \n`;

    }
    if (invalid) {
        summary += `<li class="jsBenchee-li">${invalid}</li>`;
        summaryMd += `* ${invalid}  \n`;
    }

    summary += '</ul>';
    table += summary;
    tableMd += '\n \n' + summaryMd;



    //console.log(benchmarksTable);
    return { html: table, md: tableMd };

}

//export * from './prototypes.js';
//export * from './benchmark_iframe.js';
//export * from './setup.js'



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
                    obj1[key] = [...value1, ...value2];
                } else if (isNaN(value1)) ; else {
                    obj1[key] = (value1 + value2) / 2;
                }
            }

            return obj1

        };


        /**
         * benchmark
         */
        const startBenchmarks = async () => {
            if (addCSS) await addJSbencheeStyles();

            let reportWrap = null;
            let resultWrap = null;
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
            reportWrap.querySelector('.jsBenchee-conclusion');
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
        };



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
};


// Self-executing function for IIFE
if (typeof window !== 'undefined') {
    window.jsBenchee = JsBencheeCore;
}

export { JsBencheeCore as jsBenchee };
