/** Escape plain metadata for HTML text nodes, before adding deliberate markup. */
export function escapeHtmlText(value) {
    return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Preserve scientific notation as text and retain the existing paragraph breaks. */
export function multilineTextRender(value) {
    return escapeHtmlText(value.toString().trim()).replace(/[\r\n]+/g, "<br/><br/>");
}
