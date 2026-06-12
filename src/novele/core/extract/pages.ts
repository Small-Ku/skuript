import { hostname } from "./hostname-map";
export type Page = {
    raw?: string;
    dom?: Document;
    title: Set<string>;
    content?: string[];
    additionalUrls?: string[];
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

export function getAdditionalPageUrls(url: string, html: string): string[] {
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

function mergeTitle(current: Set<string>, title?: string) {
    if (!title) return current;
    return new Set([...current, title]);
}

export function registerPageRaw(url: string, raw: string, title?: string) {
    const page = pages.get(url);
    pages.set(url, {
        ...page,
        raw,
        title: mergeTitle(page?.title ?? new Set<string>(), title),
        content: page?.content,
        dom: page?.dom,
        additionalUrls: page?.additionalUrls,
    });
}

export function registerCurrentPage(url: string, title?: string) {
    const page = pages.get(url);
    pages.set(url, {
        ...page,
        raw: document.documentElement.outerHTML,
        dom: document,
        title: mergeTitle(page?.title ?? new Set<string>(), title),
        content: page?.content,
        additionalUrls: page?.additionalUrls,
    });
}

export function setAdditionalPageUrls(url: string, additionalUrls: string[]) {
    if (!pages.has(url)) throw new Error("Page not fetched");
    const page = pages.get(url)!;
    pages.set(url, {
        ...page,
        additionalUrls,
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
    const additionalUrls = page.additionalUrls ?? [];
    const additionalDocs = await Promise.all(additionalUrls.map(async (pageUrl) => {
        const additionalPage = await parsePageDom(pageUrl);
        if (!additionalPage.dom) throw new Error(`additional page DOM not available: ${pageUrl}`);
        return additionalPage.dom;
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
    if (!pages.has(url)) throw new Error(`Page not fetched: ${url}`);
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
