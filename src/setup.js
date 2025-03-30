
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

    const currentScriptPath=()=>{
        let url = '';
        try{
            url = (new Error())
            .stack.split('\n')
            .map(stack=>{return stack.split(' ')
            .filter(Boolean)})[1]
            .slice(-1)[0]
            .replace(/\(|\)/g, '')
            .split('/')
            .slice(0,-1)
            .join('/');
        }catch{
            url = performance.getEntries()
            .slice(-1)[0].name.split('/')
            .slice(0,-1)
            .join('/');
        }

        console.log('url', url);
        return url
    };


    let url = currentScriptPath()+'/jsBenchee.css';
    let res = await (fetch(url))

    if (res.ok) {
        let css = await (res).text()
        let styleEl = document.getElementById('jsBencheeStyles');
        if (!styleEl) {
            styleEl = document.createElement('style')
            styleEl.textContent = css;
            document.head.append(styleEl);
        }
    }
}