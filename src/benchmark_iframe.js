export async function benchmarkScript(scripts = [], name = '', iterations = 25, security = true, jsBencheeScriptcache = {}, iframeID = '', returnVar = '') {

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
            let riskScore = 0

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
                    inlineScripts.push(script)
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

            let iframeContent = `<!DOCTYPE html><html><head><meta charset="UTF-8">${externalScriptContent}<\/head>
            <body>${moduleScriptContent}${inlineScriptsContent}<\/body><\/html>`;

            dataUrl = `data:text/html,${encodeURIComponent(iframeContent)}`;
            jsBencheeScriptcache[iframeID] = dataUrl
        }

        iframe.src = dataUrl;

    }


    // start benchmarking
    return new Promise((resolve) => {

        window.addEventListener('message', function listener(event) {

            let { benchmarkResult, error, value } = event.data;
            let hasBenchmarks = event.data.hasOwnProperty('benchmarkResult');
            let eventID = event.data.ID
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
                    results.value = value
                }

                results.timings.push(benchmarkResult)
                tries++

                // test new iframe instance
                if (tries < iterations) {
                    createBenchmarkIframe(moduleScriptContent, externalScriptContent, inlineScriptsContent, jsBencheeScriptcache, iframeID)

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
                    let peak = highest[0]

                    if (peak > average * 2) {

                        // remove extreme peak
                        results.timings.splice(results.timings.indexOf(peak), 1);
                        highest.shift();
                        peak = highest[0]

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
                    performance.clearMeasures();

                    //objectURL = URL.revokeObjectURL(objectURL);

                    // remove iframe
                    iframe.remove()

                }
            }
        });

        // Start the first iteration
        createBenchmarkIframe(moduleScriptContent, externalScriptContent, inlineScriptsContent, jsBencheeScriptcache, iframeID)
    }
    );
}


/**
 * generate script blocks
 * for temporary benchmarkiframe
 */
export async function generateScriptBlocks(scripts = [], iframeID = '', type = '', security = true, returnVar = '') {

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
    }


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
    }



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


    function containsAsyncCode(scriptContent) {
        // Check for common async patterns
        const asyncPatterns = [
            /\bawait\b/,
            /\basync\b/,
            /\.then\(/,
            /\.catch\(/,
            /\.finally\(/,
            /new\s+Promise\(/i,
            /fetch\(/,
            /setTimeout\(/,
            /setInterval\(/,
            /requestAnimationFrame\(/i
        ];
        return asyncPatterns.some(pattern => pattern.test(scriptContent));
    }

    let isAsync = containsAsyncCode(scriptContent);

    if(isAsync){
        scriptContent = 
        `
        const pendingPromises = new Set();
        const OriginalPromise = window.Promise;
        
        window.Promise = class TrackedPromise extends OriginalPromise {
            constructor(executor) {
                super((resolve, reject) => {
                    executor(
                        value => { pendingPromises.delete(this); resolve(value); },
                        error => { pendingPromises.delete(this); reject(error); }
                    );
                });
                pendingPromises.add(this);
            }
        };
        ${scriptContent}

        delay = 0.5
        // Wait for all promises
        while (pendingPromises.size > 0) {
            await Promise.race(Array.from(pendingPromises));
            await new Promise(r => setTimeout(r, delay));
        }
        
        // Restore original Promise
        window.Promise = OriginalPromise;
        `
    }


    scriptmarkup += `
    ${externalScriptContent}
    <script ${typeAtt}>
    ${importContent}
    ${strictMarkup}
    const iframeID = '${iframeID}';
    window.alert = () => {};
    
    window.addEventListener('load', async () => {
        let returnValue = '', t0=0, t1=0
        try {
            let delay = 0;
            t0= performance.now();
            // Execute script
            ${scriptContent};
            t1 = performance.now() - t0-delay;

            ${returnVarPost}
            parent.postMessage({ benchmarkResult: t1, value:returnValue, ID:iframeID}, '*');

        } catch (err) {
            parent.postMessage({ error: err.message, ID: iframeID }, '*');
        }
    });
    <\/script>`;

    return scriptmarkup;
}




/**
 * detect highly suspicious code
 */
export function detectUnsafeCode(script) {

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

export function createReport(benchmarks, includeColumns = []) {

    // lib prefix just for CSS compression
    const lb = 'jsBenchee';


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
    }


    let { results, agent = '', names, iterations, multipass, multitask } = benchmarks;

    // sort by average
    results.sort((a, b) => a.average - b.average);
    let invalid = ''

    // invalid result - remove
    if (results[0].average === 0) {
        invalid += `»${results[0].name}« could not be benchmarked. Please check the syntax for errors.`;
        results.shift()
    }


    let table = '';
    table += `<table class="${lb}-table">`;

    // filter if specified
    if (includeColumns.length) results = filterObjectProperties(results, includeColumns);


    // create table header
    table += `<thead class="${lb}-thead">\n<tr class="${lb}-tr">`;
    let thLabels = Object.keys(results[0]);
    table += thLabels.map(th => { return `<th class="${lb}-th">${th}</th>` }).join('\n');
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
    table += `<tbody class="${lb}-tbody">`;

    // get object keys
    let keys = Object.keys(results[0]);

    results.forEach((result, i) => {

        // add new row for each script
        table += `<tr class="${lb}-tr">`;
        tableMd += '| '

        // add property values
        for (let i = 0; i < keys.length; i++) {

            let key = keys[i];

            let vals = result[key];
            vals = Array.isArray(vals) ? vals.map(val => { return (val && !isNaN(val) ? +val.toFixed(3) : val) }).join(', ') : vals;

            if (!isNaN(vals) && vals) {
                vals = key === 'average' ? +vals.toFixed(1) : +vals.toFixed(3);
            }

            table += `<td class="${lb}-td  ${lb}-td-${key}"><span class="${lb}-td-label">${key}:</span> <span class="${lb}-td-value ${lb}-td-value-${key}">${vals}</span></td>`;
            tableMd += ` ${vals} | `;

        }

        table += `</tr>`
        tableMd += '\n';

    })

    table += `</tbody></table>`;


    /**
     * add summary
     */
    // compare - get lowest value/fastest script
    results.sort((a, b) => a.average - b.average);
    let fastest = results[0];
    let fastestAverage = +fastest.average;

    let len = results.length;
    let summary = `<ul class="${lb}-ul">`;
    let summaryMd = '';


    // compare multiple scripts
    for (let i = 0; len && i < len; i++) {
        let bench = results[i], rat = 1, diff = 0;
        let { name, average, timings } = bench;
        let feedback = ''
        let significance = '';

        if (i === 0) {
            feedback = len > 1 ? `»${fastest.name}« is the fastest executing with an average of ${fastestAverage.toFixed(3)} ms` : `»${fastest.name}« is executing with an average of ${fastestAverage.toFixed(3)} ms`;
        } else {
            rat = +(average / fastestAverage).toFixed(3);
            diff = +(Math.abs(fastestAverage - average)).toFixed(3);

            if (diff < 0.3 && fastestAverage < 1) {
                significance = `Not significant – differences are also caused by browser performance fluctuations.`
            }

            let perc = +((rat - 1) * 100).toFixed(0)
            feedback = `»${name}« is ~ ${rat} times / ~ ${perc}% / ${diff}ms slower than »${fastest.name}«. ${significance}`
        }
        summary += `<li class="${lb}-li">${feedback}</li>`;
        summaryMd += `* ${feedback}${significance}  \n`;

    };

    if (invalid) {
        summary += `<li class="${lb}-li">${invalid}</li>`
        summaryMd += `* ${invalid}  \n`;
    }

    summary += '</ul>';
    table += summary;
    tableMd += '\n \n' + summaryMd;



    //console.log(benchmarksTable);
    return { html: table, md: tableMd };

}





