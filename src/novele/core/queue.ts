import { JobQueue } from "../../util/job-queue";
import { resolvePageChapter } from "./extract/chapters";
import type { Link } from "./extract/links";
import {
	getAdditionalPageUrls,
	getPage,
	parsePageDom,
	parseStandalonePage,
	peekPage,
	registerCurrentPage,
	registerPageRaw,
	setAdditionalPageUrls,
} from "./extract/pages";

interface FetchContext {
	orderHint: number;
	url: string;
}

interface QueueContext {
	currentOrderHint: number;
}

const fetchQueue = new JobQueue<FetchContext, QueueContext, void>(
	(jobContext, context) =>
		Math.abs(jobContext.orderHint - context.currentOrderHint),
	{ currentOrderHint: 0 },
	3,
);

const inFlightFetches = new Map<string, Promise<void>>();
const CHAPTER_LOOKAHEAD = 6;

async function fetchPageText(url: string): Promise<string> {
	if (url === window.location.href) return document.documentElement.outerHTML;
	const storedPage = peekPage(url);
	if (storedPage?.raw) {
		console.debug(`Using cached raw page: ${url}`);
		return storedPage.raw;
	}
	for (;;) {
		const response = await fetch(url, { cache: "force-cache" });
		if (response.status === 429) {
			const retryAfter =
				parseInt(response.headers.get("retry-after") || "0", 10) * 1000;
			await new Promise((resolve) => setTimeout(resolve, retryAfter));
			continue;
		}
		if (!response.ok) {
			throw new Error("ERROR", { cause: response });
		}
		return response.text();
	}
}

async function queueFetch(
	url: string,
	orderHint: number,
	requireDocument = false,
): Promise<void> {
	const cachedPage = peekPage(url);
	if (cachedPage?.raw || cachedPage?.dom) return;
	if (cachedPage?.slices?.length && !requireDocument) return;

	const existing = inFlightFetches.get(url);
	if (existing) return existing;

	const promise = fetchQueue.addJob(
		async () => {
			try {
				if (url === window.location.href) {
					registerCurrentPage(url);
					return;
				}
				registerPageRaw(url, await fetchPageText(url));
			} finally {
				inFlightFetches.delete(url);
			}
		},
		{ url, orderHint },
	);
	inFlightFetches.set(url, promise);
	return promise;
}

async function ensureLinkParsed(link: Link, index: number): Promise<void> {
	const cachedPage = peekPage(link.url);
	if (cachedPage?.slices?.length) return;

	await queueFetch(link.url, index);

	const pageState = await parsePageDom(link.url);
	if (!pageState.dom) throw new Error(`page DOM not available: ${link.url}`);
	const additionalUrls = getAdditionalPageUrls(
		link.url,
		pageState.dom.documentElement.outerHTML,
	);
	setAdditionalPageUrls(link.url, additionalUrls);
	for (const [extraIndex, url] of additionalUrls.entries()) {
		await queueFetch(url, index + extraIndex + 0.1);
		await parseStandalonePage(url, link.url, extraIndex + 1);
	}
	await getPage(link.url);
}

export async function updateCurrentPage(index: number) {
	await fetchQueue.setContext({ currentOrderHint: index });
}

export async function fetchDocument(
	url: string,
	orderHint = 0,
): Promise<Document> {
	await queueFetch(url, orderHint, true);
	const page = await parsePageDom(url);
	if (!page.dom) throw new Error(`page DOM not available: ${url}`);
	return page.dom;
}

export async function queueChapterFetch(
	link: Link,
	index: number,
	orderedLinks: Link[] = [link],
): Promise<string[]> {
	const orderedUrls = orderedLinks.map((item) => item.url);
	await Promise.all(
		orderedLinks
			.slice(index, Math.min(orderedLinks.length, index + CHAPTER_LOOKAHEAD))
			.map((nextLink, offset) => ensureLinkParsed(nextLink, index + offset)),
	);
	let chapter = resolvePageChapter(link.url, orderedUrls);
	for (
		let nextIndex = index + CHAPTER_LOOKAHEAD;
		!chapter.complete && nextIndex < orderedLinks.length;
		nextIndex += 1
	) {
		await ensureLinkParsed(orderedLinks[nextIndex], nextIndex);
		chapter = resolvePageChapter(link.url, orderedUrls);
	}
	return chapter.content;
}

export async function queueCatalogFetch(
	orderedLinks: Link[],
	onSettled?: (link: Link, index: number, error?: unknown) => void,
): Promise<void> {
	const orderedUrls = orderedLinks.map((item) => item.url);
	await Promise.allSettled(
		orderedLinks.map((link, index) =>
			ensureLinkParsed(link, index)
				.then(() => {
					for (
						let resolveIndex = Math.max(0, index - CHAPTER_LOOKAHEAD);
						resolveIndex <= index;
						resolveIndex += 1
					) {
						resolvePageChapter(orderedLinks[resolveIndex].url, orderedUrls);
					}
					onSettled?.(link, index);
				})
				.catch((error) => {
					onSettled?.(link, index, error);
					throw error;
				}),
		),
	);
}
