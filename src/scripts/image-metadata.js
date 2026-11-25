const initializedControls = new WeakSet();
const MAX_METADATA_HEIGHT = 250;

export function initializeImageMetadata(document) {
  const wrap = document.getElementById('meta-wrap');
  const content = document.getElementById('meta-content');
  const toggle = document.getElementById('meta-toggle');

  if (wrap && content && toggle && !initializedControls.has(toggle)) {
    initializedControls.add(toggle);
    if (content.scrollHeight <= MAX_METADATA_HEIGHT) {
      toggle.remove();
    } else {
      toggle.hidden = false;
      wrap.dataset.collapsed = 'true';
      content.style.maxHeight = `${MAX_METADATA_HEIGHT}px`;
      content.style.overflow = 'hidden';
      toggle.onclick = () => {
        const open = toggle.getAttribute('aria-expanded') === 'true';
        toggle.setAttribute('aria-expanded', String(!open));
        toggle.innerText = open ? 'See more' : 'See less';
        wrap.dataset.collapsed = String(open);
        content.style.maxHeight = open ? `${MAX_METADATA_HEIGHT}px` : '';
      };
    }
  }

  const extra = document.getElementById('file-path-extra');
  const pathToggle = document.getElementById('file-path-toggle');
  if (extra && pathToggle && !initializedControls.has(pathToggle)) {
    initializedControls.add(pathToggle);
    pathToggle.onclick = () => {
      const open = pathToggle.getAttribute('aria-expanded') === 'true';
      pathToggle.setAttribute('aria-expanded', String(!open));
      pathToggle.innerText = open ? 'See more' : 'See less';
      extra.hidden = open;
    };
  }
}
