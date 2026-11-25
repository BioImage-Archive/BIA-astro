const footerUrl = 'https://www.embl.org/api/v1/pattern.html?filter-content-type=article&filter-id=106902&pattern=node-body&source=contenthub';

let footerHtml;

async function fetchFooter() {
  const response = await fetch(footerUrl, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch EMBL footer: ${response.status}`);
  }
  return response.text();
}

export function getEmblFooterHtml() {
  // Cache the promise so concurrently rendered pages share the same request.
  footerHtml ??= fetchFooter().catch(error => {
    footerHtml = undefined;
    throw error;
  });
  return footerHtml;
}
