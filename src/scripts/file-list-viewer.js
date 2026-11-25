const initializedDocuments = new WeakSet();

export function initializeFileListViewer(document) {
  if (initializedDocuments.has(document)) return;
  initializedDocuments.add(document);
  const window = document.defaultView;

  function loadIframes(root = document) {
    root.querySelectorAll('.file-list-viewer').forEach(iframe => {
      if (!(iframe instanceof window.HTMLIFrameElement)) return;
      if (!iframe.src && iframe.dataset.src) iframe.src = iframe.dataset.src;
    });
  }

  const containers = document.querySelectorAll('.file-list-viewer-frame');
  if (window.IntersectionObserver) {
    containers.forEach(container => {
      const observer = new window.IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        loadIframes(container);
        observer.disconnect();
      }, { rootMargin: '1200px 0px' });
      observer.observe(container);
    });
  } else if (document.readyState === 'complete') {
    loadIframes();
  } else if (containers.length) {
    window.addEventListener('load', () => loadIframes(), { once: true });
  }

  document.addEventListener('click', event => {
    if (!(event.target instanceof window.HTMLElement)) return;
    const button = event.target.closest('.file-list-view-button');
    if (!(button instanceof window.HTMLElement)) return;
    event.preventDefault();

    const selectedIframe = document.getElementById(`file-list-${button.dataset.view}-viewer`);
    if (!(selectedIframe instanceof window.HTMLIFrameElement)) return;
    button.blur();
    loadIframes();

    document.querySelectorAll('.file-list-viewer').forEach(iframe => {
      if (iframe instanceof window.HTMLIFrameElement) {
        iframe.classList.toggle('is-active', iframe === selectedIframe);
      }
    });
    document.querySelectorAll('.file-list-view-button').forEach(viewButton => {
      if (viewButton instanceof window.HTMLElement) {
        viewButton.setAttribute('aria-pressed', String(viewButton === button));
      }
    });
  });
}
