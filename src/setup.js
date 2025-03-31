
/**
 * browser sniffing is evil but
 * helpful for benchmarking
 */
export function detectBrowser() {
    let info = '', brands = [], browser = '', platform = '';


    if (navigator.userAgentData) {
        ({ brands, platform } = navigator.userAgentData);
        browser = brands.slice(-1)[0];
        info = `${browser.brand}/${browser.version} ${platform}`
    }
    else if (navigator.userAgent) {
        let agentDesc = navigator.userAgent.split(' ')
        browser = agentDesc.slice(-1)[0];
        platform = agentDesc[1].replace(/\(/g, '');
        info = `${browser} ${platform}`
    }
    return info;
}


export async function addJSbencheeStyles() {


    const getCurrentScriptUrl = ()=>{
        try {


            /** 1. try performance API */
            let urlPerf = performance.getEntries()
            .slice(1)[0].name.split('/')
            .slice(0, -1)
            .join('/');

            //if(urlPerf) return urlPerf;

            /** 2. try error API */
            let stackLines = new Error().stack.split('\n');
            let relevantLine = stackLines[1] || stackLines[2];
            if (!relevantLine) return null;
            
            // Extract URL using a more comprehensive regex
            let urlError = relevantLine.match(/(https?:\/\/[^\s]+)/)[1]
            .split('/')
            .slice(0,-1)
            .join('/');

            return urlError ;

        } catch (e) {
            console.warn("Could not retrieve script path", e);
            return null;
        }
    }


    let scriptPath = getCurrentScriptUrl();
    //console.log('scriptPath', scriptPath);

    // dist path is excluded in modules
    if(!scriptPath.includes('dist')) scriptPath +='/dist';

    let url = scriptPath + '/jsBenchee.css';
    console.log('CSSurl', url);


    let styleEl = document.getElementById('jsBencheeStyles');
    if (!styleEl) {
        styleEl = document.createElement('style')
        styleEl.id = 'jsBencheeStyles';
        //document.body.append(styleEl);
        document.body.insertBefore(styleEl, document.body.children[0]);
    }


    let res = await (fetch(url))

    if (res.ok) {
        let css = await (res).text()
        styleEl.textContent = css;
    }
}