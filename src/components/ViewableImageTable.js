const tableEl = document.querySelector("#viewable_images_table");

const studyAccessionID = tableEl.dataset.studyAccessionId;
const imagePageRoot = tableEl.dataset.imagePageRoot;
const imageFallbackSrc = tableEl.dataset.imageFallbackSrc;
const api_path = tableEl.dataset.apiPath;

  function imageUrl(image) {
    return imagePageRoot
      ? `/bioimage-archive/${imagePageRoot}/${image.uuid}`
      : `/bioimage-archive/image/${image.uuid}`;
  }

  function getMetadataValue(mdArray, key, field = null) {
    const md = mdArray?.find(md => md.name === key)?.value;
    return field && md ? md[field]?.[0] : md;
  }

  function getThumbnail(img) {
      const thumbnail_uri = getMetadataValue(img.additional_metadata, "image_thumbnail_uri")?.["256"]?.["uri"] || imageFallbackSrc;
      return thumbnail_uri;
  }
  function getDownloadSize(image) {
    var i = image?.total_size_in_bytes == 0 ? 0 : Math.floor(Math.log(image?.total_size_in_bytes) / Math.log(1000));
    return `${Number(image?.total_size_in_bytes / Math.pow(1000, i)).toFixed(2)} ${['B', 'kB', 'MB', 'GB', 'TB', 'PB'][i]}`
  }
  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function normaliseFilePaths(image) {
    const value = image.label || image.file_path || "";

    if (Array.isArray(value)) {
      return value.filter(Boolean);
    }

    return [value].filter(Boolean);
  }

  function formatFilePath(path, every = 40) {
    return (
      escapeHtml(path)
        .match(new RegExp(`.{1,${every}}`, "g"))
        ?.join("<wbr>") || ""
    );
  }

  function renderFilePaths(image) {
    const paths = normaliseFilePaths(image);

    if (paths.length === 0) return "";

    const visible = paths.slice(0, 2);
    const hidden = paths.slice(2);

    const visibleHtml = visible
      .map((path, index) => `
        <div>
          ${formatFilePath(path)}${index < paths.length - 1 ? "," : ""}
        </div>
      `)
      .join("");

    if (hidden.length === 0) {
      return `<span class="file-path">${visibleHtml}</span>`;
    }

    const hiddenHtml = hidden
      .map((path, index) => `
        <div>
          ${formatFilePath(path)}${index + visible.length < paths.length - 1 ? "," : ""}
        </div>
      `)
      .join("");

    return `
      <span class="file-path">
        ${visibleHtml}
        <span class="file-path-extra" style="display:none;">
          ${hiddenHtml}
        </span>
        <button type="button" class="file-path-toggle vf-button vf-button--link">
          Expand
        </button>
      </span>
    `;
  }
  document.addEventListener("click", function (event) {
    const button = event.target.closest(".file-path-toggle");
    if (!button) return;

    const wrapper = button.closest(".file-path");
    const extra = wrapper.querySelector(".file-path-extra");

    const isHidden = extra.style.display === "none";

    extra.style.display = isHidden ? "inline" : "none";
    button.textContent = isHidden ? "Collapse" : "Expand";
  });

  document.addEventListener("DOMContentLoaded", function () {
    const maxResultWindow = 10000;
    const cursorHistoryLimit = 40;
    const tableStateKey = `bia:viewable-images-table:${studyAccessionID}:${imagePageRoot || "default"}`;
    const tableStateMaxAgeMs = 30 * 60 * 1000;

    function loadTableState() {
      try {
        const state = history.state?.viewableImagesTableState?.key === tableStateKey
          ? history.state.viewableImagesTableState.value
          : JSON.parse(sessionStorage.getItem(tableStateKey) || "null");
        if (!state || Date.now() - state.savedAt > tableStateMaxAgeMs) return null;
        return state;
      } catch {
        return null;
      }
    }

    function getPositiveInteger(value, fallback) {
      const number = Number.parseInt(value, 10);
      return Number.isFinite(number) && number > 0 ? number : fallback;
    }

    const restoredTableState = loadTableState();
    const initialPageSize = getPositiveInteger(restoredTableState?.pageSize, 10);
    const initialDisplayPage = getPositiveInteger(restoredTableState?.displayPage, 1);
    let lastSearch = restoredTableState?.search || "";
    let lastPageSize = initialPageSize;
    let displayPage = initialDisplayPage;
    let totalPages = getPositiveInteger(restoredTableState?.totalPages, 1);
    let pendingDisplayPage = initialDisplayPage > 1 ? initialDisplayPage : null;
    let currentHasNextCursor = Boolean(restoredTableState?.currentHasNextCursor);
    let isRestoringTableState = Boolean(restoredTableState);
    const pageCursorMap = new Map();
    for (const [page, cursor] of restoredTableState?.pageCursorEntries || []) {
      const parsedPage = getPositiveInteger(page, null);
      if (parsedPage && cursor) {
        pageCursorMap.set(parsedPage, cursor);
      }
    }
    let shouldRestoreScroll = Number.isFinite(restoredTableState?.scrollY);

    function cappedPageFor(pageSize) {
      return Math.max(1, Math.floor(maxResultWindow / pageSize));
    }

    function resetCursorState(search, pageSize) {
      lastSearch = search;
      lastPageSize = pageSize;
      displayPage = 1;
      totalPages = 1;
      pendingDisplayPage = null;
      currentHasNextCursor = false;
      pageCursorMap.clear();
    }

    function saveTableState(api) {
      try {
        const state = {
          search: api.search(),
          pageSize: api.page.len(),
          displayPage,
          totalPages,
          currentHasNextCursor,
          pageCursorEntries: [...pageCursorMap.entries()],
          scrollY: shouldRestoreScroll && Number.isFinite(restoredTableState?.scrollY)
            ? restoredTableState.scrollY
            : window.scrollY,
          savedAt: Date.now(),
        };
        sessionStorage.setItem(tableStateKey, JSON.stringify(state));
        history.replaceState({
          ...(history.state || {}),
          viewableImagesTableState: {
            key: tableStateKey,
            value: state,
          },
        }, "");
      } catch {
        // State restoration is progressive enhancement.
      }
    }

    function restoreScrollPosition() {
      if (!shouldRestoreScroll) return;
      shouldRestoreScroll = false;
      requestAnimationFrame(() => {
        window.scrollTo(0, restoredTableState.scrollY);
      });
    }

    function pruneCursorHistory(currentPage) {
      for (const page of [...pageCursorMap.keys()]) {
        if (page < currentPage - cursorHistoryLimit) {
          pageCursorMap.delete(page);
        }
      }
    }

    function renderPagination(api) {
      const paginate = $("#viewable_images_table_wrapper .dataTables_paginate");
      if (!paginate.length) return;

      const cappedPage = cappedPageFor(api.page.len());
      const prevPage = displayPage - 1;
      const nextPage = displayPage + 1;
      const canPrev =
        displayPage > 1 &&
        (prevPage <= cappedPage || pageCursorMap.has(prevPage));
      const canNext =
        nextPage <= cappedPage || currentHasNextCursor;

      paginate.html(`
        <a href="#" class="paginate_button previous${canPrev ? "" : " disabled"}" data-action="prev" aria-disabled="${canPrev ? "false" : "true"}">Previous</a>
        <span class="paginate_button current">${displayPage}</span>
        <span class="paginate_button disabled">of ${totalPages} pages</span>
        <a href="#" class="paginate_button next${canNext ? "" : " disabled"}" data-action="next" aria-disabled="${canNext ? "false" : "true"}">Next</a>
      `);

      paginate.off("click.hybrid").on("click.hybrid", "a[data-action]", function (event) {
        event.preventDefault();
        const link = event.currentTarget;
        if (link.classList.contains("disabled")) return;

        const action = link.getAttribute("data-action");
        if (action === "prev") {
          const targetPage = displayPage - 1;
          if (targetPage < 1) return;
          pendingDisplayPage = targetPage;
          if (targetPage <= cappedPage) {
            api.page(targetPage - 1).draw("page");
          } else {
            api.draw(false);
          }
          return;
        }

        if (action === "next") {
          const targetPage = displayPage + 1;
          pendingDisplayPage = targetPage;
          if (targetPage <= cappedPage) {
            api.page(targetPage - 1).draw("page");
          } else {
            api.draw(false);
          }
        }
      });
    }

    if ($.fn.DataTable.isDataTable("#viewable_images_table")) {
      $("#viewable_images_table").DataTable().destroy();
    }

    const table = $("#viewable_images_table").DataTable({
      processing: true,
      serverSide: true,
      searching: true,
      ordering: false,
      scrollX: true,
      searchDelay: 800,
      pageLength: initialPageSize,
      displayStart: (initialDisplayPage - 1) * initialPageSize,
      search: {
        search: lastSearch,
      },
      pagingType: "simple",

      ajax: async function (dtParams, callback) {
        const search = dtParams.search.value;
        const pageSize = dtParams.length;
        const isReset = search !== lastSearch || pageSize !== lastPageSize;
        const cappedPage = cappedPageFor(pageSize);
        let requestedPage = isReset
          ? 1
          : pendingDisplayPage ?? (Math.floor(dtParams.start / pageSize) + 1);

        if (isReset) {
          resetCursorState(search, pageSize);
        }

        let url =
          `${api_path}/website/browse/image` +
          `?facet.accession_id=${encodeURIComponent(studyAccessionID)}` +
          `&query=${encodeURIComponent(search)}` +
          `&pagination.page_size=${pageSize}`;

        let fetchCursor = null;
        if (requestedPage <= cappedPage) {
          url += `&pagination.page=${requestedPage}`;
        } else {
          fetchCursor = pageCursorMap.get(requestedPage);
          if (!fetchCursor) {
            callback({
              draw: dtParams.draw,
              recordsTotal: totalPages * pageSize,
              recordsFiltered: totalPages * pageSize,
              data: [],
            });
            pendingDisplayPage = null;
            return;
          }
          url += `&cursor=${encodeURIComponent(fetchCursor)}`;
        }

        const res = await fetch(url);
        const json = await res.json();

        const images = (json.hits?.hits || []).map((hit) => hit._source);

        const total =
          json.hits?.total?.value ||
          json.pagination?.total_results ||
          images.length;

        displayPage = requestedPage;
        totalPages = Math.max(1, Math.ceil(total / pageSize));
        currentHasNextCursor = Boolean(json.pagination?.next_cursor);

        if (fetchCursor) {
          pageCursorMap.set(requestedPage, fetchCursor);
        }
        if (json.pagination?.next_cursor) {
          pageCursorMap.set(requestedPage + 1, json.pagination.next_cursor);
        }
        pruneCursorHistory(displayPage);
        pendingDisplayPage = null;

        callback({
          draw: dtParams.draw,
          recordsTotal: total,
          recordsFiltered: total,
          data: images,
        });
      },

      columns: [
        {
          data: "preview",
          render: (_d, _t, image) => `
            <a href="${imageUrl(image)}">
              <img class="vf-figure__image" src="${getThumbnail(image) || ""}" />
            </a>
          `,
        },
        { data: "uuid", defaultContent: "" },
        {
          data: "file_path",
          render: (_d, _t, image) => { return renderFilePaths(image); }
        },
        {
          data: "dataset",
          render: (_d, _t, image) =>
            image.dataset_title || "",
        },
        {
          data: "total_size_in_bytes",
          render: (_d, _t, image) => getDownloadSize(image),
        },
        {
          data: "actions",
          render: (_d, _t, image) =>
            `<a class="vf-link" href="${imageUrl(image)}">View</a>`,
        },
      ],
      drawCallback: function () {
        const api = this.api();
        renderPagination(api);
        saveTableState(api);
        restoreScrollPosition();
        isRestoringTableState = false;
      },
    });

    table.on("search.dt length.dt", function (event, _settings, len) {
      if (isRestoringTableState) return;
      const pageSize = event.type === "length"
        ? getPositiveInteger(len, table.page.len())
        : table.page.len();
      resetCursorState(table.search(), pageSize);
      if (event.type === "length") {
        table.page("first");
      }
      saveTableState(table);
    });

    $("#viewable_images_table").on("click", "a", function () {
      saveTableState(table);
    });

    window.addEventListener("pagehide", function () {
      saveTableState(table);
    });
  });
