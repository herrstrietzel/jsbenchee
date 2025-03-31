# jsBenchee
Benchmark JS scripts in a browser to get realistic average execution times.  

* [What it does and doesn't do](#what-it-does-and-doesnt-do)
* [Features](#features)
* [Limitations](#limitations)
* [Security](#security)
* [Usage](#usage)
  + [JS](#js)
  + [JS - ES module](#js---es-module)
* [API options/parameters](#api-options-parameters)
  + [Global settings](#global-settings)
  + [Test script settings](#test-script-settings)
  + [Example: multiple tests (compare)](#example-multiple-tests-compare)
  + [Define script dependancies](#define-script-dependancies)
* [Recommendations](#recommendations)
* [About the examples](#about-the-examples)
* [Todos](#todos)


## What it does and doesn't do
jsBenchee is designed for quick benchmark tests and performance comparisions with minimal setup. It won't give you nanosecond precision – in fact the best we can get is an accuracy around 0.1ms.  

Not too impressive, however you can retrieve a quite **realistic average timing** result to compare performance across **different browsers**.


## Features
* **minimal setup**  include es module script or iife, define tests
* **auto loading** of external library dependencies – nested module imports are not supported yet
* **versatile report output**: render the (fully responsive) benchmark report directly or use the returned data for custom processing (e.g saving to database or include them in your app UI), Markdown and JSON export.
* should run even in more restrictive environments such as StackOverflow snippets, codepens, jsFiddles etc.

## Limitations
**jsBenchee** deploys the native browser's `performance` API. Since accuracy is by default limited by most browsers to prevent timing attacks – an accuracy of ~ 0.1ms is the best we can get. However we can still get quite realistic average timings to get a close approximation of the "absolute" execution time. Also this approximation should suffice for "faster-or-slower" comparisons and it also gives insights about cross-browser performance differences.

## Security
**Please only don't run it in production environments!!!**  
Although I  tried my best to implement some security measures – in fact you can load pretty much *any* script. So please be aware of this fact an use it only for debugging in test server environments.


## Usage
Sorry, **Browser-only** – you can't run this in node or deno – more on this later.

### JS
1. Add the script to your `<head>`

```
<script src="https://cdn.jsdelivr.net/npm/jsbenchee@latest/dist/jsBenchee.min.js"></script>
```

2. Define the benchmark options an run test/s
```
let options = {
    tests: [
        {
            name: 'simple script',
            scripts: [
                `async function waitFor(ms = 100) {
                    return new Promise(resolve => {
                        setTimeout(() => resolve('waiting for' +ms+'ms'), ms);
                    });
                }

                (async () => {
                let delay = await waitFor(15);
                return delay;
                })();`
            ],
        },
    ],
};

// init benchmark
let benchmark = new jsBenchee(options);
```

The above example takes the minimal setup and renders a benchmark report directly to your test HTML page. We can refine the output behavior. See API options.



### JS - ES module 
Same as above, but make sure you add the "module" type to your script tag like so:

```
<script type="module">

// import jsbenchee main function
import {jsbenchee} from 'https://cdn.jsdelivr.net/npm/jsbenchee@0.1.1/+esm'

let options = {
    tests: [
        {
            name: 'simple script',
            scripts: [
                `async function waitFor(ms = 100) {
                    return new Promise(resolve => {
                        setTimeout(() => resolve('waiting for' +ms+'ms'), ms);
                    });
                }

                (async () => {
                let delay = await waitFor(15);
                return delay;
                })();`
            ],
        },
    ],
};

// init benchmark
let benchmark = new jsBenchee(options);

</script>
```

## API options/parameters
The benchmark options are passed to `jsBenchee(options)` as an object.  

### Global settings

| parameter | type | default | effect |
|:--|--:|--:| --:|
| iterations | number | 25 | number of benchmark test: higher values will return more realistic average values |
| agentDetection | Boolean | false | adds agent info to the report table – browser sniffing is bad but in this case it makes sense |
| multitask | Boolean | true | Run multiple test scripts in parallel. This returns reports faster but also affects accuracy – especially for more complex/expensive function. Disable it if you need better accuracy. For lightweight functions keep it activated  |
| returnVar | string | empty/disabled | Allows to include a variable to the report table. Foremost for debugging to check if the tested script returns the expected value |
| security | Boolean | true | adds some very, very basic security heuristics to prevent malicious code execution. In case it returns false-positives - disable it |
| render | Boolean | true | render the report table to the HTML DOM directly or not |
| target | string/CSS selector | empty | define a target element for the report to be appended | 
| addCSS | Boolean | true | auto-load jsBenchee CSS for report tables. Optional - you can also include the CSS manually from `dist/jsBenchee.css` or use your own stylesheets |
| includeColumns | array | empty/[] | define the columns for the report table. For instance you could exclude the timings columns like so `includeColumns = ['name, average, lowest, highest ]` |
| tests | array | empty/[]  | the actual scripts to benchmark - see next table | 


### Test script settings
You can add multiple scripts by adding items to the `tests` array: 

| property | type | effect |
| :-- | --: | --: |
| name | string | just to identify your script in the report table |
| scripts | array | add multiple scripts: these can be selfcontained script chunks or external references/library dependancies (see examples) |

### Example: multiple tests (compare)

```
<script type="module">
import jsbenchee from 'https://cdn.jsdelivr.net/npm/jsbenchee@latest/+esm'
let d = `M10000 10000h10000a10000 10000 0 1 1 -10000 -10000 z`;
let options = {
    //define multiple tests
    tests: [
        {
            name: 'fontello - svgpath',
            scripts: [
                `import svgpath from 'https://cdn.jsdelivr.net/npm/svgpath@2.6.0/+esm';
                let d ='${d}';
                let pathData = new svgpath(d);
                let dNew = pathData.segments.map(com=>{return com.join(' ')}).join(' ')`
            ]
        },
        {
            name: 'pathData polyfill',
            scripts: [
                `let d = '${d}';
                let pathData = parsepathPolyfill(d); 
                let dNew = pathData.map(com=>{return \`\${com.type} \${com.values.join(' ')}\`}).join(' ');

                function parsepathPolyfill(d) {
                    //create temporary path
                    let path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
                    path.setAttribute('d', d);
                    let pathData = path.getPathData();
                    path.remove();
                    return pathData
                }`,
                `https://cdn.jsdelivr.net/npm/path-data-polyfill@1.0.7/path-data-polyfill.min.js`
            ]
        },
        {
            name: 'svg path commander',
            scripts: [
                `let d = '${d}';
                let pathData = SVGPathCommander.parsePathString(d);
                let dNew = pathData.map(com=>{return com.join(' ')}).join(' ')`,
                'https://cdn.jsdelivr.net/gh/thednp/svg-path-commander@refs/heads/master/dist/svg-path-commander.js'
            ]
        },
    ],
    // increase iterations for more realistic average results
    iterations: 25,
    // enable browser detection
    agentDetection: true,
    // target for report rendering
    target: '#benchmarks',
    // render/append report to DOM
    render: true,
    // keep basic security check
    security: true,
    // run all compared scripts in parallel
    multitask: true,
    // output variable result
    returnVar: 'dNew',
    // define columns for report
    includeColumns: ['name', 'average', 'highest', 'lowest', 'value']
};

/**
* jsbenchee in async mode
* process the results as you like
*/
(async () => {
    // wait for the benchmark results
    let benchmark = await new jsBenchee(options);
    console.log('Async Benchmark Results:', benchmark);
})();

</script>
```

### Define script dependancies 
Each test item in the `tests` array accepts multiple script definitions. If a script starts with an URL – jsBenchee will automatically detect it as a dependency.  

``` 
{
    name: 'svg path commander',
    scripts: [
        // actual script to benchmark
        `let d = '${d}';
        let pathData = SVGPathCommander.parsePathString(d);
        let dNew = pathData.map(com=>{return com.join(' ')}).join(' ')`,

        // load dependancy
        'https://cdn.jsdelivr.net/gh/thednp/svg-path-commander@refs/heads/master/dist/svg-path-commander.js'
    ]
},

```



## Recommendations
* Always **close DevTools** – especially on Chromium-based browsers opended dev tools significantly affect the timing results
* Double check the stringified JS code chunks:
 **Backticks** need to be escaped: Make sure backtick strings using template literals are escaped like so (prepending a backslash before the backtick  and the "$")
```
let dNew = pathData.map(com=>{return \`\${com.type} \${com.values.join(' ')}\`});
```
* disable "multitask" mode for better comparisons. While the multitask mode is convenient for rather lightweight function calls it also affects the overall processing load and therefore the timing results.


## About the examples
All of the used SVG libraries are excellent and none of if by any means "sluggish". I chose this comparisons to provide a realistic use case with scripts that are actually pretty close performance-wise.

## Todos
* testing
* testing
* testing
* testing
* better error detection returning more details
* adding better security measures



