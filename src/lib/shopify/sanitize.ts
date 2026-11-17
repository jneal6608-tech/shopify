/**
 * Defence-in-depth HTML sanitiser for content sent to Shopify (product
 * descriptions, collection descriptions, pages). Content is also reviewed by
 * the merchant before publishing. Removes active content: script/style/iframe/
 * object/embed/form elements, inline event handlers and javascript:/data: URLs.
 */
// Paired elements are removed with their content; any stray/unpaired or void
// dangerous tags are removed on their own.
const PAIRED = /<\s*(script|style|iframe|object|embed|form|svg|math|noscript|template)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const STRAY = /<\s*\/?\s*(script|style|iframe|object|embed|form|input|button|link|meta|base|svg|math|noscript|template)\b[^>]*>/gi;
const EVENT_ATTRS = /\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const JS_URLS = /\s+(href|src|action|formaction|xlink:href)\s*=\s*("|')?\s*(javascript|vbscript|data):[^"'>\s]*("|')?/gi;
const STYLE_ATTR = /\s+style\s*=\s*("[^"]*expression\([^"]*"|'[^']*expression\([^']*')/gi;

export function sanitizeHtml(html: string): string {
  let out = html;
  for (let i = 0; i < 3; i++) {
    const before = out;
    out = out.replace(PAIRED, "").replace(STRAY, "").replace(EVENT_ATTRS, "").replace(JS_URLS, "").replace(STYLE_ATTR, "");
    if (out === before) break;
  }
  return out;
}
