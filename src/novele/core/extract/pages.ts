import { hostname } from "./hostname-map";
import type { Link } from "./links";

export type Page = {
    raw?: string;
    dom?: Document;
    title: Set<string>;
    content?: string[];
}

const paraSelector = {
    "www.52shuku.vip": ".article-content",
    "www.dameishuwang.net": ".readcontent",
    "www.sunzhinan.com": "#article",
    "www.xbanxia.com": "#nr1",
    "www.256wx.org": "#nr1",
    "www.zhenhunxiaoshuo.com": ".article-content",
}[hostname];
const titleSelector = {
    "www.sunzhinan.com": ".style_h1",
    "www.xbanxia.com": "#nr_title",
    "www.zhenhunxiaoshuo.com": ".article-header > .article-title",
    "www.52shuku.vip": "#nr_title",
}[hostname];

const pages: Map<string, Page> = new Map();

function nextPaginatedUrl(url: string, pageIndex: number): string {
    return url.replace(/(_1)?\.html(?:([?#].*)?)$/, `_${pageIndex}.html$2`);
}

function getAdditionalPageUrls(url: string, html: string): string[] {
    const urls: string[] = [];
    for (let i = 2; ; i++) {
        const pageUrl = new URL(nextPaginatedUrl(url, i), url);
        const nextPath = pageUrl.pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const hasNextPage = new RegExp(`href=["'][^"']*${nextPath}[^"']*["']`).test(html);
        if (!hasNextPage) break;
        urls.push(pageUrl.href);
    }
    return urls;
}

async function fetchPageText(url: string): Promise<string> {
    if (url === window.location.href) return document.documentElement.outerHTML;
    const stored = sessionStorage.getItem(url);
    if (stored && stored.length > 0) {
        console.debug(`Using cached page from sessionStorage: ${url}`);
        return stored;
    }
    for (;;) {
        const response = await fetch(url, { cache: "force-cache" });
        if (response.status === 429) {
            const retryAfter = parseInt(response.headers.get("retry-after") || "0", 10) * 1000;
            await new Promise((resolve) => setTimeout(resolve, retryAfter));
            continue;
        }
        if (!response.ok) {
            throw new Error("ERROR", { cause: response });
        }
        const responseText = await response.text();
        if (sessionStorage) sessionStorage.setItem(url, responseText);
        return responseText;
    }
}

export async function fetchPage(link: Link) {
    if (pages.has(link.url)) {
        console.warn(`Page already fetched: ${link.url}`);
        return;
    }
    const title: Set<string> = link.title ? new Set([link.title]) : new Set();
    if (link.url === window.location.href) {
        console.debug(`Fetching current page: ${link.url}`);
        pages.set(link.url, {
            raw: document.documentElement.outerHTML,
            dom: document,
            title
        });
        return;
    }
    pages.set(link.url, {
        raw: await fetchPageText(link.url),
        title
    });
}

export async function parsePageDom(url: string) {
    if (!pages.has(url)) throw new Error("Page not fetched");
    // biome-ignore lint/style/noNonNullAssertion: checked above
    const page = pages.get(url)!;
    if (page.dom || page.content) return page;
    if (!page.raw) throw new Error("Page not parsed and no raw content");

    const parser = new DOMParser();
    page.dom = parser.parseFromString(page.raw!, "text/html");
    delete page.raw;
    pages.set(url, page);
    return page;
}

export async function getContent(doc: Document): Promise<string[]> {
    if (!paraSelector) return [];
    // biome-ignore lint/style/noNonNullAssertion: checked above
    return Array.from(doc.querySelectorAll(paraSelector!)).flatMap(
        (root) => {
            if (!root.childElementCount) return [];
            const content: string[] = [];
            const tw = document.createTreeWalker(root,
                NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT
            );
            let elm: Node | null, newline = true;
            // biome-ignore lint/suspicious/noAssignInExpressions: working on my Firefox
            while (elm = tw.nextNode()) {
                if (elm.nodeType === Node.TEXT_NODE) {
                    const text = (<Text>elm).wholeText.split('\n').map(t => t.trim()).filter(t => t);
                    if (!text.length) continue;
                    if (!newline) {
                        content[content.length - 1] += text.shift();
                    }
                    content.push(...text);
                    newline = false;
                } else if (elm.nodeType === Node.ELEMENT_NODE) {
                    if (["P", "BR"].includes((<Element>elm).tagName)) newline = true;
                }
            }
            return content;
        });
}

export async function getTitle(doc: Document) {
    if (!titleSelector) return new Set<string>();
    // biome-ignore lint/style/noNonNullAssertion: checked above
    return new Set(Array.from(doc.querySelectorAll(titleSelector!)).flatMap(
        (elm) => {
            const text = elm.textContent?.trim();
            return text ? [text] : [];
        }));
}

export async function parsePage(url: string) {
    const page = await parsePageDom(url);
    if (page.content) return page;
    if (!page.dom) throw new Error("Page DOM not available");

    const [_content, _title] = await Promise.all([getContent(page.dom), getTitle(page.dom)]);
    const additionalUrls = getAdditionalPageUrls(url, page.dom.documentElement.outerHTML);
    const additionalDocs = await Promise.all(additionalUrls.map(async (pageUrl) => {
        const parser = new DOMParser();
        return parser.parseFromString(await fetchPageText(pageUrl), "text/html");
    }));
    const additionalContent = await Promise.all(additionalDocs.map((doc) => getContent(doc)));
    const additionalTitle = await Promise.all(additionalDocs.map((doc) => getTitle(doc)));
    page.content = _content;
    page.content.push(...additionalContent.flat());
    page.title = new Set([...page.title, ..._title, ...additionalTitle.flatMap((title) => [...title])]);

    delete page.dom;
    pages.set(url, page);
    return page;
}

export async function getPage(url: string): Promise<Page> {
    if (pages && !pages.has(url)) {
        console.warn(`Page not fetched, fetching now: ${url}`, pages);
        await fetchPage({ url });
    }
    const page = await parsePage(url);
    if (!page.content || !page.title) {
        throw new Error("Page content or title not available");
    }
    return page;
}

export function findPage(url: string): Page {
    if (!pages.has(url)) throw new Error("Page not fetched");
    // biome-ignore lint/style/noNonNullAssertion: checked above
    const page = pages.get(url)!;
    return page;
}
