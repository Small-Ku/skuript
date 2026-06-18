import { hostname } from "./hostname-map";
import {
	type CommentPageRef,
	deletePage as deleteStoredPage,
	getPage as getStoredPage,
	type PageSlice,
	type StoredPage,
	setPage as setStoredPage,
} from "./storage";
import { getCommentPageRefs } from "./comments";

export type Page = StoredPage;

const paraSelectors = {
	"www.52shuku.vip": [".article-content"],
	"www.dameishuwang.net": [".readcontent"],
	"www.sunzhinan.com": ["#article"],
	"www.xbanxia.com": ["#nr1"],
	"www.256wx.org": ["#nr1"],
	"www.zhenhunxiaoshuo.com": [".article-content", ".focusbox-text .text"],
}[hostname];
const titleSelectors = {
	"www.sunzhinan.com": [".style_h1"],
	"www.xbanxia.com": ["#nr_title"],
	"www.zhenhunxiaoshuo.com": [
		".article-header > .article-title",
		".focusbox-title",
	],
	"www.52shuku.vip": ["#nr_title"],
}[hostname];
const contentCleanupSelectors = {
	"www.52shuku.vip": [
		"script",
		"style",
		".pagination2",
		".go_top",
		"#go-top",
		"ul.list",
		"p.con_pc",
	],
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
	return url.replace(/(_\d+)?\.html(?:([?#].*)?)$/, `_${pageIndex}.html$2`);
}

export function getAdditionalPageUrls(url: string, html: string): string[] {
	if (hostname === "www.52shuku.vip") return [];
	const urls: string[] = [];
	for (let i = 2; ; i++) {
		const pageUrl = new URL(nextPaginatedUrl(url, i), url);
		const nextPath = pageUrl.pathname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const hasNextPage = new RegExp(`href=["'][^"']*${nextPath}[^"']*["']`).test(
			html,
		);
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

async function yieldToBrowser() {
	await new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

function cleanupContentRoot(root: Element) {
	for (const selector of contentCleanupSelectors ?? []) {
		if (selector === ".pagination2") continue;
		root.querySelectorAll(selector).forEach((item) => item.remove());
	}
	for (const pagination of Array.from(root.querySelectorAll(".pagination2"))) {
		let node: ChildNode | null = pagination;
		while (node) {
			const next: ChildNode | null = node.nextSibling;
			node.remove();
			node = next;
		}
	}
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
		slices: page?.slices,
		resolvedChapter: page?.resolvedChapter,
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
		slices: page?.slices,
		resolvedChapter: page?.resolvedChapter,
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
	if (page.dom) return page;
	if (!page.raw) throw new Error("Page not parsed and no raw content");

	const parser = new DOMParser();
	page.dom = parser.parseFromString(page.raw, "text/html");
	delete page.raw;
	persistPage(page);
	return page;
}

export function releasePageDom(url: string) {
	const page = getStoredPage(url);
	if (!page?.dom) return;
	delete page.dom;
	persistPage(page);
}

export async function getContent(doc: Document): Promise<string[]> {
	if (!paraSelectors?.length) return [];
	const mergedContent: string[] = [];
	for (const root of paraSelectors.flatMap((selector) =>
		Array.from(doc.querySelectorAll(selector)),
	)) {
		const contentRoot = root.cloneNode(true) as Element;
		cleanupContentRoot(contentRoot);
		if (!contentRoot.childElementCount && !contentRoot.textContent?.trim())
			continue;
		const content: string[] = [];
		const tw = document.createTreeWalker(
			contentRoot,
			NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
		);
		let elm: Node | null;
		let newline = true;
		let nodeCount = 0;
		// biome-ignore lint/suspicious/noAssignInExpressions: working on my Firefox
		while ((elm = tw.nextNode())) {
			nodeCount += 1;
			if (nodeCount % 250 === 0) {
				await yieldToBrowser();
			}
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
		mergedContent.push(...content);
	}
	return mergedContent;
}

export async function getTitle(doc: Document) {
	if (!titleSelectors?.length) return new Set<string>();
	return new Set(
		titleSelectors.flatMap((selector) =>
			Array.from(doc.querySelectorAll(selector)).flatMap((elm) => {
				const text = elm.textContent?.trim();
				return text ? [text] : [];
			}),
		),
	);
}

function mergeSliceTitle(page: Page, slice: PageSlice) {
	const titles = new Set(page.title);
	slice.title.forEach((title) => titles.add(title));
	page.title = titles;
}

function createPageSlice(
	page: Page,
	url: string,
	parentUrl: string,
	subPageIndex: number,
	title: Set<string>,
	content: string[],
	commentPages: CommentPageRef[],
): PageSlice {
	return {
		url,
		parentUrl,
		subPageIndex,
		title: [...title],
		content,
		chapterCandidates: page.slices?.find((slice) => slice.url === url)
			?.chapterCandidates,
		commentPages,
	};
}

export async function parseStandalonePage(
	url: string,
	parentUrl = url,
	subPageIndex = 0,
): Promise<Page> {
	const cachedPage = ensurePage(url);
	if (cachedPage.slices?.length) return cachedPage;
	const page = await parsePageDom(url);
	if (!page.dom) throw new Error(`Page DOM not available: ${url}`);

	const [content, title] = await Promise.all([
		getContent(page.dom),
		getTitle(page.dom),
	]);
	const commentPages = getCommentPageRefs(page.dom, url, "chapter");
	const slice = createPageSlice(
		page,
		url,
		parentUrl,
		subPageIndex,
		title,
		content,
		commentPages,
	);
	page.slices = [slice];
	page.resolvedChapter = undefined;
	mergeSliceTitle(page, slice);
	delete page.dom;
	persistPage(page);
	return page;
}

export async function parsePage(url: string) {
	const page = await parseStandalonePage(url, url, 0);
	const additionalUrls = page.additionalUrls ?? [];
	if (!additionalUrls.length) return page;

	const slices = [...(page.slices ?? [])];
	const mergedTitle = new Set(page.title);
	for (const pageUrl of additionalUrls) {
		await yieldToBrowser();
		const additionalPage = await parseStandalonePage(
			pageUrl,
			url,
			slices.length,
		);
		(additionalPage.slices ?? []).forEach((slice) => {
			slices.push(slice);
			slice.title.forEach((title) => mergedTitle.add(title));
		});
		deleteStoredPage(pageUrl);
	}

	page.slices = slices.sort((a, b) => a.subPageIndex - b.subPageIndex);
	page.title = mergedTitle;
	page.resolvedChapter = undefined;
	page.additionalUrls = [];
	delete page.dom;
	persistPage(page);
	return page;
}

export async function getPage(url: string): Promise<Page> {
	const page = await parsePage(url);
	if (!page.slices?.length || !page.title) {
		throw new Error("Page slices or title not available");
	}
	return page;
}

export function findPage(url: string): Page {
	return ensurePage(url);
}
