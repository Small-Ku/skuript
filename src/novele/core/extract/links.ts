import { LinkedMap } from "../../../util/linked-map";
import { hostname } from "./hostname-map";
import { fetchDocument } from "../queue";

export type Link = {
	url: string;
	title?: string;
};

type LinkListener = (links: Link[]) => void;
type Direction = "prev" | "next";

const catalogLinkSelectors = {
	"www.52shuku.vip": ["ul.list > li.mulu > a"],
	"www.dameishuwang.net": ["#list-chapterAll > dd > a"],
	"www.xbanxia.com": [".book-list > ul > li > a"],
	"www.sunzhinan.com": ["#ul_all_chapters > li > a"],
	"www.256wx.org": ["#nr1 > a"],
	"www.zhenhunxiaoshuo.com": [".excerpts-wrapper > .excerpts > .excerpt > a"],
}[hostname];

const indexLinkSelectors = {
	"www.52shuku.vip": [".pagination2 a"],
	"www.dameishuwang.net": [".readend a", ".page a"],
	"www.xbanxia.com": ["#bcrumb a[rel='category tag']"],
	"www.sunzhinan.com": ["#info_url", ".text_info a[href*='/books/']", ".read_nav a"],
	"www.256wx.org": [".page a"],
	"www.zhenhunxiaoshuo.com": [".article-meta a[rel='category tag']", ".article-nav a[rel='category tag']"],
}[hostname];

const chapterNavSelectors = {
	"www.52shuku.vip": [".pagination2 a"],
	"www.dameishuwang.net": [".readend a", ".page a"],
	"www.xbanxia.com": [".nav2 a", "#prev_url", "#next_url"],
	"www.sunzhinan.com": [".read_nav a", "#prev_url", "#next_url"],
	"www.256wx.org": [".page a"],
	"www.zhenhunxiaoshuo.com": [".article-nav a[rel='prev']", ".article-nav a[rel='next']"],
}[hostname];

const linkTransform = (() => {
	switch (hostname) {
		case "www.zhenhunxiaoshuo.com":
			return (s: string) => `${s}/comment-page-1/`;
	}
})();

let linkStore = new LinkedMap<Link, string>();
const listeners = new Set<LinkListener>();
let discoveryPromise: Promise<Link[]> | null = null;

function toLink(link: Element): Link {
	// biome-ignore lint/style/noNonNullAssertion: filtered by callers
	let href = link instanceof HTMLAnchorElement ? link.href : link.getAttribute("href")!;
	if (linkTransform) href = linkTransform(href);
	return {
		url: href,
		title: link.textContent?.trim(),
	};
}

function dedupeLinks(_links: Link[]): Link[] {
	const seen = new Set<string>();
	return _links.filter((link) => {
		if (seen.has(link.url)) return false;
		seen.add(link.url);
		return true;
	});
}

function parseBySelectors(doc: Document, selectors: string[] | undefined): Link[] {
	if (!selectors?.length) return [];
	return dedupeLinks(selectors
		.flatMap((selector) => Array.from(doc.querySelectorAll(selector)))
		.filter((link) => link.getAttribute("href"))
		.map(toLink));
}

function getDocumentUrl(doc: Document): string | undefined {
	if (doc === document) return window.location.href;
	return doc.URL && doc.URL !== "about:blank" ? doc.URL : undefined;
}

function emitLinks() {
	const orderedLinks = linkStore.toArray();
	listeners.forEach((listener) => listener(orderedLinks));
}

function upsertBoundaryLink(link: Link) {
	if (linkStore.getById(link.url)) return;
	linkStore.addItem({
		id: link.url,
		data: link,
		prev: null,
		next: null,
	});
	emitLinks();
}

function insertDiscoveredLink(link: Link, referenceUrl: string, direction: Direction) {
	if (linkStore.getById(link.url)) return;
	if (!linkStore.getById(referenceUrl)) {
		upsertBoundaryLink({ url: referenceUrl });
	}
	if (!linkStore.getById(referenceUrl)) throw new Error(`reference link missing: ${referenceUrl}`);
	if (direction === "prev") linkStore.insertBefore(link.url, link, referenceUrl);
	else linkStore.insertAfter(link.url, link, referenceUrl);
	emitLinks();
}

function replaceAllLinks(_links: Link[]) {
	if (!_links.length) return [];
	linkStore = LinkedMap.fromArray<Link, Link, string>(
		_links,
		(link: Link) => link.url,
		(link: Link) => link,
	);
	emitLinks();
	return getLinks();
}

function isIndexLink(link: Link): boolean {
	const text = link.title?.replace(/\s+/g, "") ?? "";
	if (text.match(/目录|目錄|章节列表|章節列表|书页|書頁/)) return true;
	switch (hostname) {
		case "www.xbanxia.com":
			return link.url.includes("/books/") && !link.url.match(/\/books\/\d+\/\d+\.html(?:[?#].*)?$/);
		case "www.sunzhinan.com":
			return link.url.includes("/books/");
		case "www.zhenhunxiaoshuo.com":
			return link.url.includes("zhenhunxiaoshuo.com/") && !link.url.match(/\/\d+\.html(?:[?#].*)?(?:\/comment-page-1\/)?$/);
		default:
			return false;
	}
}

function classifyChapterNavLink(link: Link): Direction | "unknown" {
	const text = link.title?.replace(/\s+/g, "") ?? "";
	if (text.match(/上一[页頁章篇]?|前一[页頁章篇]?/)) return "prev";
	if (text.match(/下一[页頁章篇]?|后一[页頁章篇]?/)) return "next";
	return "unknown";
}

function getChapterNavMap(doc: Document): Map<Direction, Link> {
	const navMap = new Map<Direction, Link>();
	for (const link of parseBySelectors(doc, chapterNavSelectors)) {
		const role = classifyChapterNavLink(link);
		if (role !== "unknown" && !navMap.has(role)) navMap.set(role, link);
	}
	return navMap;
}

async function crawlChapterDirection(startUrl: string, direction: Direction): Promise<void> {
	const seen = new Set<string>([startUrl]);
	let currentUrl = startUrl;
	for (;;) {
		const pageDoc = await fetchDocument(currentUrl);
		const nextLink = getChapterNavMap(pageDoc).get(direction);
		if (!nextLink || seen.has(nextLink.url)) break;
		seen.add(nextLink.url);
		insertDiscoveredLink(nextLink, currentUrl, direction);
		currentUrl = nextLink.url;
	}
}

export function resetLinks() {
	linkStore = new LinkedMap<Link, string>();
	discoveryPromise = null;
	listeners.clear();
}

export function getLinks(): Link[] {
	return linkStore.toArray();
}

export function subscribeLinks(listener: LinkListener): () => void {
	listeners.add(listener);
	listener(getLinks());
	return () => listeners.delete(listener);
}

export function parseLinks(doc: Document): Link[] {
	const _links = parseBySelectors(doc, catalogLinkSelectors);
	if (!_links.length) throw new Error("catalog links not found");
	return _links;
}

export async function resolveLinks(doc: Document): Promise<Link[]> {
	if (discoveryPromise) return discoveryPromise;
	discoveryPromise = (async () => {
		const catalogLinks = parseBySelectors(doc, catalogLinkSelectors);
		if (catalogLinks.length) return replaceAllLinks(catalogLinks);

		const currentUrl = getDocumentUrl(doc);
		if (!currentUrl) throw new Error("current page URL not available");
		upsertBoundaryLink({ url: currentUrl });

		const indexLinks = parseBySelectors(doc, indexLinkSelectors).filter(isIndexLink);
		const indexLink = indexLinks[0];
		if (indexLink) {
			const pageDoc = await fetchDocument(indexLink.url);
			const resolvedLinks = parseBySelectors(pageDoc, catalogLinkSelectors);
			if (!resolvedLinks.length) throw new Error("catalog links not found on index page");
			return replaceAllLinks(resolvedLinks);
		}

		await Promise.all([
			crawlChapterDirection(currentUrl, "prev"),
			crawlChapterDirection(currentUrl, "next"),
		]);
		return getLinks();
	})();
	return discoveryPromise;
}
