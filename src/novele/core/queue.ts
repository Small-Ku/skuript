import { JobQueue } from "../../util/job-queue";
import type { Link } from "./extract/links";
import { parsePageChapter } from "./extract/chapters";
import {
	getAdditionalPageUrls,
	getPage,
	peekPage,
	parsePageDom,
	parseStandalonePage,
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
	(jobContext, context) => Math.abs(jobContext.orderHint - context.currentOrderHint),
	{ currentOrderHint: 0 },
	3,
);

const inFlightFetches = new Map<string, Promise<void>>();

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
			const retryAfter = parseInt(response.headers.get("retry-after") || "0", 10) * 1000;
			await new Promise((resolve) => setTimeout(resolve, retryAfter));
			continue;
		}
		if (!response.ok) {
			throw new Error("ERROR", { cause: response });
		}
		return response.text();
	}
}

async function queueFetch(url: string, orderHint: number, requireDocument = false): Promise<void> {
	const cachedPage = peekPage(url);
	if (cachedPage?.raw || cachedPage?.dom) return;
	if (cachedPage?.content && !requireDocument) return;

	const existing = inFlightFetches.get(url);
	if (existing) return existing;

	const promise = fetchQueue.addJob(async () => {
		try {
			if (url === window.location.href) {
				registerCurrentPage(url);
				return;
			}
			registerPageRaw(url, await fetchPageText(url));
		} finally {
			inFlightFetches.delete(url);
		}
	}, { url, orderHint });
	inFlightFetches.set(url, promise);
	return promise;
}

export async function updateCurrentPage(index: number) {
	await fetchQueue.setContext({ currentOrderHint: index });
}

export async function fetchDocument(url: string, orderHint = 0): Promise<Document> {
	await queueFetch(url, orderHint, true);
	const page = await parsePageDom(url);
	if (!page.dom) throw new Error(`page DOM not available: ${url}`);
	return page.dom;
}

export async function queueChapterFetch(
	link: Link,
	index: number,
): Promise<string[]> {
	await queueFetch(link.url, index);
	const cachedPage = peekPage(link.url);
	if (cachedPage?.content) {
		await parsePageChapter(link.url);
		return cachedPage.content;
	}

	const pageState = await parsePageDom(link.url);
	if (!pageState.dom) throw new Error(`page DOM not available: ${link.url}`);
	const additionalUrls = getAdditionalPageUrls(
		link.url,
		pageState.dom.documentElement.outerHTML,
	);
	setAdditionalPageUrls(link.url, additionalUrls);
	for (const [extraIndex, url] of additionalUrls.entries()) {
		await queueFetch(url, index + extraIndex + 0.1);
		await parseStandalonePage(url);
	}
	const page = await getPage(link.url);
	await parsePageChapter(link.url);
	return page.content || [];
}
