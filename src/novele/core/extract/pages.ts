import { hostname } from "./hostname-map";
import {
	deletePage as deleteStoredPage,
	getPage as getStoredPage,
	setPage as setStoredPage,
	type StoredPage,
} from "./storage";

export type Page = StoredPage;

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

function ensurePage(url: string): Page {
	if (url === window.location.href && !getStoredPage(url)) {
		registerCurrentPage(url);
	}
	const page = getStoredPage(url);
	if (!page) throw new Error(`Page not fetched: ${url}`);
	return page;
}

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

function persistPage(page: Page): Page {
	page.lastModified = new Date();
	return setStoredPage(page);
}

export function peekPage(url: string): Page | undefined {
	return getStoredPage(url);
}

export function registerPageRaw(url: string, raw: string, title?: string) {
	const page = getStoredPage(url);
	return persistPage({
		url,
		raw,
		dom: page?.dom,
		title: mergeTitle(page?.title ?? new Set<string>(), title),
		content: page?.content,
		additionalUrls: page?.additionalUrls,
		lastModified: new Date(),
	});
}

export function registerCurrentPage(url: string, title?: string) {
	const page = getStoredPage(url);
	return persistPage({
		url,
		raw: document.documentElement.outerHTML,
		dom: document,
		title: mergeTitle(page?.title ?? new Set<string>(), title),
		content: page?.content,
		additionalUrls: page?.additionalUrls,
		lastModified: new Date(),
	});
}

export function setAdditionalPageUrls(url: string, additionalUrls: string[]) {
	const page = ensurePage(url);
	persistPage({
		...page,
		additionalUrls,
	});
}

export async function parsePageDom(url: string) {
	const page = ensurePage(url);
	if (page.dom || page.content) return page;
	if (!page.raw) throw new Error("Page not parsed and no raw content");

	const parser = new DOMParser();
	page.dom = parser.parseFromString(page.raw, "text/html");
	delete page.raw;
	persistPage(page);
	return page;
}

export async function getContent(doc: Document): Promise<string[]> {
	if (!paraSelector) return [];
	return Array.from(doc.querySelectorAll(paraSelector)).flatMap((root) => {
		if (!root.childElementCount) return [];
		const content: string[] = [];
		const tw = document.createTreeWalker(
			root,
			NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
		);
		let elm: Node | null;
		let newline = true;
		// biome-ignore lint/suspicious/noAssignInExpressions: working on my Firefox
		while ((elm = tw.nextNode())) {
			if (elm.nodeType === Node.TEXT_NODE) {
				const text = (elm as Text).wholeText
					.split("\n")
					.map((t) => t.trim())
					.filter((t) => t);
				if (!text.length) continue;
				if (!newline) {
					content[content.length - 1] += text.shift();
				}
				content.push(...text);
				newline = false;
			} else if (elm.nodeType === Node.ELEMENT_NODE) {
				if (["P", "BR"].includes((elm as Element).tagName)) newline = true;
			}
		}
		return content;
	});
}

export async function getTitle(doc: Document) {
	if (!titleSelector) return new Set<string>();
	return new Set(
		Array.from(doc.querySelectorAll(titleSelector)).flatMap((elm) => {
			const text = elm.textContent?.trim();
			return text ? [text] : [];
		}),
	);
}

export async function parseStandalonePage(url: string): Promise<Page> {
	const page = await parsePageDom(url);
	if (page.content) return page;
	if (!page.dom) throw new Error(`Page DOM not available: ${url}`);

	const [content, title] = await Promise.all([getContent(page.dom), getTitle(page.dom)]);
	page.content = content;
	page.title = new Set([...page.title, ...title]);
	delete page.dom;
	persistPage(page);
	return page;
}

export async function parsePage(url: string) {
	const page = await parseStandalonePage(url);
	const additionalUrls = page.additionalUrls ?? [];
	if (!additionalUrls.length) return page;

	const mergedContent = [...(page.content ?? [])];
	const mergedTitle = new Set(page.title);
	for (const pageUrl of additionalUrls) {
		const additionalPage = await parseStandalonePage(pageUrl);
		mergedContent.push(...(additionalPage.content ?? []));
		additionalPage.title.forEach((title) => mergedTitle.add(title));
		deleteStoredPage(pageUrl);
	}

	page.content = mergedContent;
	page.title = mergedTitle;
	page.additionalUrls = [];
	delete page.dom;
	persistPage(page);
	return page;
}

export async function getPage(url: string): Promise<Page> {
	const page = await parsePage(url);
	if (!page.content || !page.title) {
		throw new Error("Page content or title not available");
	}
	return page;
}

export function findPage(url: string): Page {
	return ensurePage(url);
}
