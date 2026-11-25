// Keep training tabs independent of the Visual Framework bundle's remote services.
export function initializeTrainingTabs(document) {
  const window = document.defaultView;

  for (const list of document.querySelectorAll('[data-vf-js-tabs]')) {
    const tabs = Array.from(list.querySelectorAll('.vf-tabs__link'));
    const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
    if (!tabs.length || panels.some(panel => !panel)) continue;

    list.setAttribute('role', 'tablist');
    tabs.forEach((tab, index) => {
      const panel = panels[index];
      tab.id = `${panel.id}--tab`;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-controls', panel.id);
      tab.parentElement.setAttribute('role', 'presentation');
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
      panel.tabIndex = 0;
    });

    function activate(index, { focus = false, updateHash = false } = {}) {
      tabs.forEach((tab, position) => {
        const selected = position === index;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
        tab.classList.toggle('is-active', selected);
        panels[position].hidden = !selected;
      });
      if (focus) tabs[index].focus({ preventScroll: true });
      if (updateHash) window.history.pushState(null, '', `#${panels[index].id}`);
    }

    function activateFromHash() {
      const index = panels.findIndex(panel => `#${panel.id}` === window.location.hash);
      activate(index < 0 ? 0 : index);
    }

    tabs.forEach((tab, index) => {
      tab.addEventListener('click', event => {
        event.preventDefault();
        activate(index, { focus: true, updateHash: true });
      });
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = tabs.length - 1;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          panels[index].focus({ preventScroll: true });
        }
        if (next === undefined) return;
        event.preventDefault();
        activate(next, { focus: true, updateHash: true });
      });
    });

    activateFromHash();
    window.addEventListener('hashchange', activateFromHash);
    window.addEventListener('popstate', activateFromHash);
  }
}
