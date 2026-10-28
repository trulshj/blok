import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useLayoutEffect, useRef } from "react";
import { imageUrl } from "../lib/images.ts";
import { previewMarkdown, UPRIGHT_NUMBER } from "../lib/vertical.ts";

/** Sets short numbers upright (縦中横), outside code. */
function uprightNumbers(root: DocumentFragment) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest("code, pre") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const texts: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
  for (const text of texts) {
    const value = text.data;
    if (!UPRIGHT_NUMBER.test(value)) continue;
    UPRIGHT_NUMBER.lastIndex = 0;
    const parts: Node[] = [];
    let pos = 0;
    for (const match of value.matchAll(UPRIGHT_NUMBER)) {
      if (match.index > pos) parts.push(document.createTextNode(value.slice(pos, match.index)));
      const span = document.createElement("span");
      span.className = "tcy";
      span.textContent = match[0];
      parts.push(span);
      pos = match.index + match[0].length;
    }
    if (pos < value.length) parts.push(document.createTextNode(value.slice(pos)));
    text.replaceWith(...parts);
  }
}

/** The note set vertically, right to left, as a Japanese book or magazine would (縦書き). Read-only. */
export function VerticalPreview({ body, slug, lang }: { body: string; slug: string; lang: string }) {
  const page = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = page.current;
    if (!el) return;
    const html = marked.parse(previewMarkdown(body), { async: false, gfm: true });
    const fragment = DOMPurify.sanitize(html, { RETURN_DOM_FRAGMENT: true });
    for (const img of fragment.querySelectorAll("img")) {
      const url = imageUrl(slug, img.getAttribute("src") ?? "");
      if (url) img.src = url;
      else img.remove();
    }
    uprightNumbers(fragment);
    el.replaceChildren(fragment);
  }, [body, slug]);

  // the wheel scrolls along the lines: down moves on to the next column, to the left
  useEffect(() => {
    const el = page.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      const before = el.scrollLeft;
      el.scrollLeft -= e.deltaY;
      if (el.scrollLeft !== before) e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return <div ref={page} className="vertical" lang={lang} tabIndex={0} aria-label="Vertical preview" />;
}
