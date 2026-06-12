import { JobQueue } from "../../util/job-queue";
import type { Link } from "./extract/links";
import { parsePageChapter } from "./extract/chapters";
import {
	getAdditionalPageUrls,
	getPage,
	parsePageDom,
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

async function queueFetch(url: string, orderHint: number): Promise<void> {
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
	await queueFetch(url, orderHint);
	const page = await parsePageDom(url);
	if (!page.dom) throw new Error(`page DOM not available: ${url}`);
	return page.dom;
}

export async function queueChapterFetch(
	link: Link,
	index: number,
): Promise<string[]> {
	await queueFetch(link.url, index);
	const pageState = await parsePageDom(link.url);
	if (!pageState.dom) throw new Error(`page DOM not available: ${link.url}`);
	const additionalUrls = getAdditionalPageUrls(
		link.url,
		pageState.dom.documentElement.outerHTML,
	);
	setAdditionalPageUrls(link.url, additionalUrls);
	await Promise.all(
		additionalUrls.map((url, extraIndex) =>
			queueFetch(url, index + extraIndex + 0.1),
		),
	);
	const page = await getPage(link.url);
	await parsePageChapter(link.url);
	return page.content || [];
}
