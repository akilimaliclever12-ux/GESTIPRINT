// Minimal HTML sanitizer for teacher/parent-authored rich text (consigne,
// student answer). Whitelists a few formatting tags and strips everything else
// (scripts, styles, event handlers, unknown attributes) so rendered content
// can never carry XSS. Links are limited to http(s)/mailto and forced safe.
const ALLOWED = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI', 'P', 'BR', 'A', 'DIV', 'SPAN']);
const SAFE_LINK = /^(https?:|mailto:)/i;

export function sanitizeHtml(html) {
  if (!html) return '';
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html);

  const walk = (node) => {
    // Iterate over a static copy — we mutate the tree as we go.
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        return;
      }
      const tag = child.tagName;
      if (!ALLOWED.has(tag)) {
        // Unwrap: keep the (sanitized) children, drop the tag itself.
        walk(child);
        const parent = child.parentNode;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        child.remove();
        return;
      }
      // Strip every attribute except a safe href on <a>.
      [...child.attributes].forEach((attr) => {
        if (tag === 'A' && attr.name === 'href' && SAFE_LINK.test(attr.value.trim())) return;
        child.removeAttribute(attr.name);
      });
      if (tag === 'A') {
        child.setAttribute('target', '_blank');
        child.setAttribute('rel', 'noopener noreferrer nofollow');
      }
      walk(child);
    });
  };
  walk(tpl.content);
  return tpl.innerHTML;
}

// True when the rich text carries no visible content (empty editor).
export function isBlankHtml(html) {
  if (!html) return true;
  const tpl = document.createElement('template');
  tpl.innerHTML = String(html);
  return !(tpl.content.textContent || '').trim() && !tpl.content.querySelector('img');
}
