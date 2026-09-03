const SHELL_ID = "search-results-shell";
let activeSearchNavigation = 0;

function buildCleanHistoryURL(url) {
    const nextURL = new URL(url.toString(), window.location.origin);
    nextURL.searchParams.delete("pagination.page");
    nextURL.searchParams.delete("cursor");
    nextURL.searchParams.delete("page");
    nextURL.searchParams.delete("prev_cursor_1");
    nextURL.searchParams.delete("prev_cursor_2");
    return nextURL;
}

function buildNumberedPageURL(targetPage) {
    const nextURL = buildCleanHistoryURL(new URL(window.location.href));
    nextURL.searchParams.set("pagination.page", String(targetPage));
    return nextURL.toString();
}

function buildCursorFetchURL(cursor, targetPage) {
    const nextURL = new URL(window.location.href);
    nextURL.searchParams.set("cursor", cursor);
    if (typeof targetPage === "number") {
      nextURL.searchParams.set("pagination.page", String(targetPage));
    } else {
      nextURL.searchParams.delete("pagination.page");
    }
    return nextURL.toString();
}

function buildVisiblePaginationURL() {
    return buildCleanHistoryURL(new URL(window.location.href)).toString();
}

function renderCursorPagination(root = document, state = history.state || {}) {
    const nav = root.querySelector(".vf-pagination");
    if (!(nav instanceof HTMLElement)) return;

    const totalPages = Number(nav.dataset.totalPages || "1");
    const cappedPage = Number(nav.dataset.cappedPage || "1");
    const currentPage = Number(nav.dataset.currentPage || "1");
    const hasCursor = nav.dataset.hasCursor === "true";
    const nextHref = nav.dataset.nextHref || "";
    const currentCursor = nav.dataset.currentCursor || "";
    const stateCursorPage = Number(state?.cursorPage || 0);
    const cursorTrail = Array.isArray(state?.cursorTrail) ? state.cursorTrail : [];
    const displayPage = hasCursor ? Math.max(cappedPage + 1, stateCursorPage || cappedPage + 1) : currentPage;
    
    const list = nav.querySelector(".vf-pagination__list");
    if (!(list instanceof HTMLElement)) return;

    if (!hasCursor) return;

    const prevCursor1 = cursorTrail[0] || "";
    const prevCursor2 = cursorTrail[1] || "";
    const nextState = JSON.stringify({
      cursorPage: displayPage + 1,
      cursorTrail: [currentCursor, ...cursorTrail].filter(Boolean).slice(0, 7),
    });
    const prevState1 = JSON.stringify({
      cursorPage: displayPage - 1,
      cursorTrail: cursorTrail.slice(1, 7),
    });
    const prevState2 = JSON.stringify({
      cursorPage: displayPage - 2,
      cursorTrail: cursorTrail.slice(2, 7),
    });

    function buildPageLink(page, fetchUrl, navState, cursorPage) {
      const cursorPageAttr = typeof cursorPage === "number"
        ? ` data-cursor-page="${cursorPage}"`
        : "";
      return `<li class="vf-pagination__item"><a href="${buildVisiblePaginationURL()}" data-fetch-url="${fetchUrl}" data-nav-state='${navState}'${cursorPageAttr}>${page}</a></li>`;
    }

    const renderedItems = [];

    function appendRenderedPage(page, fetchUrl, navState, cursorPage) {
      const previous = renderedItems.at(-1);
      if (previous?.type === "page" && page - previous.page > 1) {
        renderedItems.push({ type: "ellipsis" });
      }
      if (previous?.type === "page" && previous.page === page) return;
      renderedItems.push({ type: "page", page, fetchUrl, navState, cursorPage });
    }

    for (let pageNumber = 1; pageNumber <= Math.min(5, cappedPage); pageNumber += 1) {
      appendRenderedPage(
        pageNumber,
        buildNumberedPageURL(pageNumber),
        JSON.stringify({ page: pageNumber }),
      );
    }

    appendRenderedPage(
      cappedPage,
      buildNumberedPageURL(cappedPage),
      JSON.stringify({ page: cappedPage }),
    );

    if (prevCursor2 && displayPage - 2 > cappedPage) {
      appendRenderedPage(displayPage - 2, buildCursorFetchURL(prevCursor2, displayPage - 2), prevState2, displayPage - 2);
    }

    if (prevCursor1 && displayPage - 1 > cappedPage) {
      appendRenderedPage(displayPage - 1, buildCursorFetchURL(prevCursor1, displayPage - 1), prevState1, displayPage - 1);
    }

    appendRenderedPage(displayPage, "", "");

    if (nextHref && displayPage + 1 <= totalPages) {
      appendRenderedPage(displayPage + 1, nextHref, nextState, displayPage + 1);
    }

    const lastRenderedPage = [...renderedItems].reverse().find((item) => item.type === "page")?.page || 0;
    const showTailEllipsis = totalPages - lastRenderedPage > 1;

    const previousItem = prevCursor1
      ? `<li class="vf-pagination__item vf-pagination__item--previous-page"><a href="${buildVisiblePaginationURL()}" data-fetch-url="${buildCursorFetchURL(prevCursor1, displayPage - 1)}" data-nav-state='${prevState1}'>Previous</a></li>`
      : displayPage - 1 <= cappedPage
        ? `<li class="vf-pagination__item vf-pagination__item--previous-page"><a href="${buildVisiblePaginationURL()}" data-fetch-url="${buildNumberedPageURL(displayPage - 1)}" data-nav-state='${JSON.stringify({ page: displayPage - 1 })}'>Previous</a></li>`
        : `<li class="vf-pagination__item vf-pagination__item--previous-page"><span>Previous</span></li>`;

    const items = [
      previousItem,
      ...renderedItems.map((item) => {
        if (item.type === "ellipsis") {
          return `<li class="vf-pagination__item"><span aria-hidden="true">...</span></li>`;
        }
        if (item.page === displayPage) {
          return `<li class="vf-pagination__item vf-pagination__item--is-active"><span style="padding: 0.25rem 0.5rem; background-color: #3b6fb6; color: white;">${displayPage}</span></li>`;
        }
        return buildPageLink(item.page, item.fetchUrl, item.navState, item.cursorPage);
      }),
      showTailEllipsis ? `<li class="vf-pagination__item"><span aria-hidden="true">...</span></li>` : ``,
      `<li class="vf-pagination__item"><span>out of ${totalPages} pages</span></li>`,
      `<li class="vf-pagination__item vf-pagination__item--next-page">${nextHref ? `<a href="${buildVisiblePaginationURL()}" data-fetch-url="${nextHref}" data-cursor-page="${displayPage + 1}" data-nav-state='${nextState}'>Next</a>` : "<span>Next</span>"}</li>`
    ];

    list.innerHTML = items.join("");
}

function syncPaginatedResults(root = document, state = history.state || {}) {
    const shell = root.querySelector("#search-results-shell");
    const label = root.querySelector("#paginated-results");
    if (!(shell instanceof HTMLElement) || !(label instanceof HTMLElement)) return;
    const totalResults = Number(shell.dataset.totalResults || "0");
    const pageSize = Number(shell.dataset.pageSize || "12");
    const resultsCount = Number(shell.dataset.resultsCount || "0");
    const cappedPage = Number(shell.dataset.cappedPage || "1");
    const hasCursor = shell.dataset.hasCursor === "true";
    const currentPage = Number(shell.dataset.currentPage || "1");
    const shellDisplayPage = Number(shell.dataset.displayPage || currentPage || cappedPage + 1);
    const displayPage = hasCursor
      ? Number(state?.cursorPage || shellDisplayPage)
      : Number(state?.page || currentPage);
    if (resultsCount === 0) return;
    const start = ((displayPage - 1) * pageSize) + 1;
    const end = Math.min(start + resultsCount - 1, totalResults);
    label.textContent = `${start} - ${end} of ${totalResults} results`;
}

async function navigateSearch(url, { push = true, state = {} } = {}) {
    const navigationId = ++activeSearchNavigation;
    const currentShell = document.getElementById(SHELL_ID);
    if (!currentShell) {
      window.location.href = url.toString();
      return;
    }

    currentShell.classList.add("is-loading");

    try {
      const response = await fetch(url.toString(), {
        headers: { "X-Requested-With": "fetch" },
      });

      if (!response.ok) throw new Error(`Search navigation failed: ${response.status}`);

      const html = await response.text();
      const nextDocument = new DOMParser().parseFromString(html, "text/html");
      const nextShell = nextDocument.getElementById(SHELL_ID);

      if (!nextShell) throw new Error(`Could not find #${SHELL_ID} in fetched page`);
      if (navigationId !== activeSearchNavigation) return;

      currentShell.replaceWith(nextShell);
      document.title = nextDocument.title;

      if (push) {
        history.pushState(state, "", buildCleanHistoryURL(url).toString());
      }

      initSearchResultsShell(nextShell);
    } catch (error) {
      console.error(error);
      window.location.href = url.toString();
    } finally {
      if (navigationId === activeSearchNavigation) {
        document.getElementById(SHELL_ID)?.classList.remove("is-loading");
      }
    }
}

function getSearchURLFromForm(form) {
    const url = new URL(form.action, window.location.origin);
    const formData = new FormData(form);

    url.search = "";
    for (const [key, value] of formData.entries()) {
      if (value === "") continue;
      url.searchParams.append(key, value.toString());
    }

    const hasCriteria = [...url.searchParams.entries()].some(([key, value]) => (
      value !== "" &&
      key !== "pagination.page" &&
      key !== "pagination.page_size" &&
      key !== "cursor" &&
      key !== "sort_by" &&
      key !== "sort_order" &&
      key !== "sort_source"
    ));

    if (!hasCriteria && url.searchParams.get("sort_by") === "relevance" && url.searchParams.get("sort_source") !== "user") {
      url.searchParams.delete("sort_by");
      url.searchParams.delete("sort_order");
      url.searchParams.delete("sort_source");
    }

    return url;
}

function submitFacetsForm() {
    const form = document.getElementById("facets");
    if (!form) return;
    form.querySelector('[name="pagination.page"]')?.remove();
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();
    } else {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    }
}

function formatBytesToHumanSize(sizeBytes) {
    const i = sizeBytes == 0 ? 0 : Math.floor(Math.log(sizeBytes) / Math.log(1000));
    return `${Number(sizeBytes / Math.pow(1000, i)).toFixed(2)} ${['B', 'kB', 'MB', 'GB', 'TB', 'PB'][i]}`
}

function pct(v, min, max) {
    return ((v - min) / (max - min)) * 100;
}

function formatRangeLabel(label, a, b) {
    return label.classList.contains("total_size_in_bytes")
      ? `${formatBytesToHumanSize(a)} – ${formatBytesToHumanSize(b)}`
      : `${Math.floor(a)} – ${Math.ceil(b)}`;
}

function syncSlider(container, from) {
    const minEl = container.querySelector(".slider-min");
    const maxEl = container.querySelector(".slider-max");
    const progress = container.querySelector(".slider-progress");
    const label = container.closest(".slider-facet")?.querySelector(".slider-label");
    const gte = container.closest(".slider-facet")?.querySelector(".slider-gte");
    const lte = container.closest(".slider-facet")?.querySelector(".slider-lte");
    
    if (!minEl || !maxEl || !progress || !gte || !lte) return;

    const minBound = Number(container.dataset.min);
    const maxBound = Number(container.dataset.max);

    let a = Number(minEl.value);
    let b = Number(maxEl.value);

    if (a > b) {
      if (from === "min") {
        a = b;
        minEl.value = String(a);
      } else {
        b = a;
        maxEl.value = String(b);
      }
    }

    const left = pct(a, minBound, maxBound);
    const right = pct(b, minBound, maxBound);
    progress.style.left = left + "%";
    progress.style.width = (right - left) + "%";

    label.textContent = formatRangeLabel(label, a, b);

    container.dataset.dirty = "1";


    const hadInitial = gte.dataset.initial === "1" || lte.dataset.initial === "1";

    if (from !== "init" || hadInitial) {
      gte.value = String(a);
      lte.value = String(b);
    }


    gte.disabled = gte.value === "";
    lte.disabled = lte.value === "";


    if (a === minBound && b === maxBound) {
      gte.value = "";
      lte.value = "";
      gte.disabled = true;
      lte.disabled = true;
      container.dataset.dirty = "0";
      label.textContent = label.dataset.default ?? formatRangeLabel(label, minBound, maxBound);
      
    }
}

function initSliders(root) {
  root.querySelectorAll(".slider-slider").forEach((container) => {
    syncSlider(container, "init");

    const minEl = container.querySelector(".slider-min");
    const maxEl = container.querySelector(".slider-max");
    minEl?.addEventListener("input", () => syncSlider(container, "min"));
    maxEl?.addEventListener("input", () => syncSlider(container, "max"));

    minEl?.addEventListener("change", submitFacetsForm);
    maxEl?.addEventListener("change", submitFacetsForm);
  });
}

function clamp(n, lo, hi) {
    if (!Number.isFinite(n)) return NaN;
    return Math.min(hi, Math.max(lo, n));
}

function setHiddenNumber(input, value) {
    const hasValue = Number.isFinite(value);
    input.value = hasValue ? String(value) : "";
    input.disabled = !hasValue;
}

function initRangeFacet(fieldset) {
    const gte = fieldset.querySelector('input.range-gte[type="number"]');
    const lte = fieldset.querySelector('input.range-lte[type="number"]');
    const gteHidden = fieldset.querySelector('input.range-gte-hidden[type="hidden"]');
    const lteHidden = fieldset.querySelector('input.range-lte-hidden[type="hidden"]');
    if (!gte || !lte || !gteHidden || !lteHidden) return;

    const minBound = Number(gte.min);
    const maxBound = Number(gte.max);

    let debounceTimer = null;
    const DEBOUNCE_MS = 1500;

    function commit(from) {
      const rawA = gte.value === "" ? NaN : Number(gte.value);
      const rawB = lte.value === "" ? NaN : Number(lte.value);

      let a = clamp(rawA, minBound, maxBound);
      let b = clamp(rawB, minBound, maxBound);

      if (from === "gte" && Number.isFinite(a) && !Number.isFinite(b)) {
        b = maxBound;
        lte.value = String(b);
      }
      if (from === "lte" && Number.isFinite(b) && !Number.isFinite(a)) {
        a = minBound;
        gte.value = String(a);
      }

      if (Number.isFinite(a) && Number.isFinite(b) && a > b) {
        if (from === "gte") {
          a = b;
          gte.value = String(a);
        } else {
          b = a;
          lte.value = String(b);
        }
      }

      setHiddenNumber(gteHidden, a);
      setHiddenNumber(lteHidden, b);

      submitFacetsForm();
    }

    function debounceCommit(from) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => commit(from), DEBOUNCE_MS);
    }

    gte.addEventListener("input", () => debounceCommit("gte"));
    lte.addEventListener("input", () => debounceCommit("lte"));
    gte.addEventListener("blur", () => commit("gte"));
    lte.addEventListener("blur", () => commit("lte"));

    gte.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit("gte"); }});
    lte.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit("lte"); }});
}

function initRangeFacets(root) {
    root.querySelectorAll("fieldset.range-facet").forEach(initRangeFacet);
}

function toggleView(viewId) {
        const views = ['card-view', 'table-view', 'grid-view'];
        views.forEach(id => {
            const view = document.getElementById(id);
            if (view) view.style.display = id === viewId ? 'block' : 'none';
        });
        
        if (viewId === 'table-view') {
            window.dataTable?.columns?.adjust?.();
        }
}
function initViewControls(root) {
        root.querySelectorAll('input[name="view"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    toggleView(e.target.value);
                }
            });
        });
        root.querySelectorAll('input[name="columns"]').forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.checked) {
                    window.setGridColumns(Number(e.target.value));
                }
            });
        });

  window.setGridColumns = function(columns) {
    const gridInner = document.querySelector('.grid-inner');
    if (gridInner) {
        gridInner.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
        
        const sizeBars = document.querySelectorAll('.compact-size-bar');
        const icons = document.querySelectorAll('.icon-container');
        
        const display = columns === 5 ? 'none' : '';
        sizeBars.forEach(bar => bar.style.display = display);
        icons.forEach(icon => icon.style.display = display);
    }
  }
  window.setGridColumns(4);
}

function initConvertedImageToggle(root) {
    const toggle = root.querySelector("#convertedImageToggle");
    const hidden = root.querySelector("#has_converted_image_hidden");
    const form = root.querySelector("#facets");

    if (!toggle || !hidden || !form) return;

    const url = new URL(window.location.href);
    const on = url.searchParams.has("has_converted_image");
    toggle.checked = on;

    hidden.disabled = !on;

    toggle.addEventListener("change", () => {
      hidden.disabled = !toggle.checked;

      const pageInput = form.querySelector('input[name="pagination.page"]');
      if (pageInput) pageInput.remove();

      submitFacetsForm();
    });
}

function isMobile() {
    const regex = /Mobi|Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
    return regex.test(navigator.userAgent);
}

function initFacetSections(root) {
    root.querySelectorAll(".facet-section").forEach((section) => {
      const secClass = isMobile() ? "collapsed" : "open";
      const styleDisplay = isMobile() ? "none" : "block";
      section.classList.remove("collapsed", "open");
      section.classList.add(secClass);
      const options = section.querySelector(".facet-options");
      if (options) options.style.display = styleDisplay;
    });
}

function initPageSize(root) {
    root.querySelector("#pageSize")?.addEventListener("change", (event) => {
      const url = new URL(window.location.href);
      url.searchParams.set("pagination.page_size", event.target.value);
      url.searchParams.delete("pagination.page");
      url.searchParams.delete("cursor");
      navigateSearch(url);
    });
}

function initSortOptions(root) {
    const sortBy = root.querySelector("#sortBy");
    const sortOrder = root.querySelector("#sortOrder");
    const updateSort = (event) => {
      const url = new URL(window.location.href);
      url.searchParams.delete("sortBy");
      url.searchParams.delete("sortOrder");
      url.searchParams.delete("sort_by");
      url.searchParams.delete("sort_order");
      url.searchParams.delete("sort_source");

      const selectedSortBy = sortBy?.value || "";
      const selectedSortOrder = sortOrder?.value || "";
      const shouldResetSort = event?.target?.value === "";
      if (!shouldResetSort && (selectedSortBy || selectedSortOrder)) {
        url.searchParams.set("sort_by", selectedSortBy || "relevance");
        url.searchParams.set("sort_order", selectedSortOrder || "desc");
        url.searchParams.set("sort_source", "user");
      }

      url.searchParams.delete("pagination.page");
      url.searchParams.delete("cursor");
      navigateSearch(url);
    };

    sortBy?.addEventListener("change", updateSort);
    sortOrder?.addEventListener("change", updateSort);
}

function initSearchResultsShell(root = document) {
    initSliders(root);
    initRangeFacets(root);
    initViewControls(root);
    initConvertedImageToggle(root);
    initFacetSections(root);
    initPageSize(root);
    initSortOptions(root);
    renderCursorPagination(root, history.state || {});
    syncPaginatedResults(root, history.state || {});
  }

document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "facets") return;

    event.preventDefault();
    navigateSearch(getSearchURLFromForm(form));
});

document.addEventListener("change", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (!target.matches('#facets input[type="checkbox"]')) return;

    submitFacetsForm();
});

document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;

    const tooltipClose = target.closest("[data-tooltip-close]");
    if (tooltipClose) {
      event.preventDefault();
      event.stopPropagation();
      tooltipClose.closest(".tooltip")?.classList.add("is-dismissed");
      return;
    }

    const facetToggle = target.closest("[data-facet-toggle]");
    if (facetToggle) {
      const id = facetToggle.getAttribute("data-facet-toggle");
      const section = document.getElementById(`facet-section-${id}`);
      const options = document.getElementById(`facet-option-${id}`);
      if (section && options) {
        const isCollapsed = section.classList.toggle("collapsed");
        options.style.display = isCollapsed ? "none" : "block";
      }
      return;
}

    const link = target.closest(".facet-remove-btn, .vf-pagination a");
    if (!(link instanceof HTMLAnchorElement)) return;

    const fetchURL = link.dataset.fetchUrl || link.href;
    const url = new URL(fetchURL, window.location.origin);
    if (url.host === window.location.host) {
      url.protocol = window.location.protocol;
    }
    if (url.origin !== window.location.origin) return;

    event.preventDefault();
    navigateSearch(url, {
      state: link.dataset.navState
        ? JSON.parse(link.dataset.navState)
        : link.dataset.cursorPage
          ? { cursorPage: Number(link.dataset.cursorPage) }
          : {},
    });
  });

document.addEventListener("keydown", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const facetToggle = target.closest("[data-facet-toggle]");
    if (!facetToggle || (event.key !== "Enter" && event.key !== " ")) return;

    event.preventDefault();
    facetToggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
});

window.addEventListener("popstate", (event) => {
    navigateSearch(new URL(window.location.href), { push: false, state: event.state || {} });
});

initSearchResultsShell(document);
