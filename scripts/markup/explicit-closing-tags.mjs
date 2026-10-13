/**
 * Repository policy for authored Astro: require a written closing tag, except for
 * HTML void elements and explicitly self-closed Astro elements/components.
 * Uses parser-provided AST ranges, NOT a regex scan of an entire Astro file.
 * No autofix: only a human can determine the intended closing boundary.
 */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const OPTIONAL = new Set([
  'html', 'head', 'body', 'li', 'dt', 'dd', 'p', 'rt', 'rp',
  'optgroup', 'option', 'colgroup', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
]);

export function tagName(node) {
  if (!node) return null;
  if (node.type === 'JSXIdentifier') return node.name;
  if (node.type === 'JSXMemberExpression') {
    const object = tagName(node.object);
    const property = tagName(node.property);
    return object && property ? `${object}.${property}` : null;
  }
  if (node.type === 'JSXNamespacedName') {
    const namespace = tagName(node.namespace);
    const name = tagName(node.name);
    return namespace && name ? `${namespace}:${name}` : null;
  }
  return null;
}

export function inspectElement(node, getText) {
  const opening = node.openingElement;
  const name = tagName(opening?.name);
  if (!name) throw new Error('Unsupported Astro tag-name AST; audit coverage cannot be established.');
  // Uppercase <Link> is a component, not an HTML void <link>.
  if (VOID.has(name)) return null;
  // The parser can synthesize JSX self-closing syntax: inspect the ORIGINAL text.
  if (getText(opening).trimEnd().endsWith('/>')) return null;
  const closing = node.closingElement;
  if (closing && tagName(closing.name) === name) {
    const raw = getText(closing).trim();
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^</${escaped}\\s*>$`, 'u').test(raw)) return null;
  }
  return {
    name,
    policyOnly: OPTIONAL.has(name),
    messageId: OPTIONAL.has(name) ? 'optionalEnd' : 'missingEnd',
  };
}

const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Require explicit, source-written closing tags in Astro.' },
    schema: [],
    messages: {
      missingEnd: '<{{name}}> has no matching explicit closing tag. Close it at the intended boundary; do not blindly append a tag at EOF.',
      optionalEnd: '<{{name}}> has no explicit closing tag. Even where HTML permits omission, repository readability policy requires </{{name}}> (or explicit Astro self-closing syntax).',
    },
  },
  create(context) {
    const source = context.sourceCode ?? context.getSourceCode();
    if (!source.parserServices?.isAstro) return {};
    return {
      JSXElement(node) {
        const finding = inspectElement(node, (n) => source.getText(n));
        if (finding) {
          context.report({
            node: node.openingElement,
            messageId: finding.messageId,
            data: { name: finding.name },
          });
        }
      },
    };
  },
};
export default { rules: { 'explicit-closing-tags': rule } };
