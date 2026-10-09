const BLOCKS = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,dt,dd,div,section,article,main,body';
const ALWAYS_SKIP = 'script,style,noscript,template,pre,kbd,samp,svg,math,canvas,iframe,input,textarea,select,button,form,[contenteditable]:not([contenteditable="false"]),[translate="no"],.notranslate,[hidden],[aria-hidden="true"],[data-ct-owned]';
const CHROME_SKIP = 'nav,header,footer,aside,[role="navigation"],[role="banner"],[role="complementary"]';
const PROSE = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,figcaption,td,th,dt,dd';

function textOutsideCode(node) {
  if (node.nodeType === 3) return node.textContent;
  if (node.matches?.(`code,${ALWAYS_SKIP}`)) return '';
  return [...node.childNodes].map(textOutsideCode).join('');
}

export function cleanText(text) { return text.replace(/\s+/gu, ' ').trim(); }

export function splitPageText(text, limit = 1600) {
  const chars = Array.from(text);
  const chunks = [];
  for (let offset = 0; offset < chars.length;) {
    let end = Math.min(offset + limit, chars.length);
    if (end < chars.length) {
      for (let i = end - 1; i > offset + limit / 2; i--) {
        if (/[\s。！？.!?；;]/u.test(chars[i])) { end = i + 1; break; }
      }
    }
    chunks.push(chars.slice(offset, end).join(''));
    offset = end;
  }
  return chunks;
}

export function pageRoots(doc, scope = 'smart') {
  if (scope === 'all') return [doc.body];
  const candidates = [...doc.querySelectorAll('main,article,[role="main"]')]
    .filter(el => !el.closest(ALWAYS_SKIP) && cleanText(el.textContent).length >= 30);
  const roots = candidates.filter(el => !candidates.some(other => other !== el && other.contains(el)));
  return roots.length ? roots : [doc.body];
}

// 只收集文本，不改写源节点；链接、格式、输入框及页面事件继续属于网站。
export function collectPageSegments(doc, scope = 'smart', visible = () => true) {
  const groups = new Map();
  const proseCache = new WeakMap();
  for (const root of pageRoots(doc, scope)) {
    if (!root) continue;
    const walker = doc.createTreeWalker(root, 4);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.textContent.trim() || parent.closest(ALWAYS_SKIP)
        || (scope !== 'all' && parent.closest(CHROME_SKIP)) || !visible(parent)) continue;
      if (parent.closest('code')) {
        const prose = parent.closest(PROSE);
        if (!prose) continue;
        if (!proseCache.has(prose)) proseCache.set(prose, /\p{Letter}/u.test(textOutsideCode(prose)));
        if (!proseCache.get(prose)) continue;
      }
      const element = parent.closest(BLOCKS) || parent;
      if (!groups.has(element)) groups.set(element, []);
      groups.get(element).push(node.textContent);
    }
  }
  return [...groups].map(([element, parts]) => ({ element, text: cleanText(parts.join('')) }))
    .filter(segment => /\p{Letter}/u.test(segment.text));
}
