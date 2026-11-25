import { readFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';

const html = await readFile(new URL('./embl-footer.html', import.meta.url), 'utf8');
const originalFetch = globalThis.fetch;
const footerUrl = 'https://www.embl.org/api/v1/pattern.html?filter-content-type=article&filter-id=106902&pattern=node-body&source=contenthub';

globalThis.fetch = (input, options) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === footerUrl) {
        if (process.env.BIA_EMBL_FOOTER_REQUEST_LOG) {
            appendFileSync(process.env.BIA_EMBL_FOOTER_REQUEST_LOG, 'fetch\n');
        }
        return Promise.resolve(new Response(html, { headers: { 'Content-Type': 'text/html' } }));
    }
    return originalFetch(input, options);
};
