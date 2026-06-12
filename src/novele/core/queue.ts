import { JobQueue } from "../../util/job-queue";
import type { Link } from "./extract/links";
import { parsePageChapter } from "./extract/chapters";
import { fetchPage, getPage, parsePageDom } from "./extract/pages";

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

async function fetchPageWithRetry(link: Link): Promise<void> {
	for (;;) {
		try {
			await fetchPage(link);
			return;
		} catch (err: any) {
			console.error(`Error fetching page ${link.url}:`, err);
			const response: Response | undefined = err?.cause;
			if (!response || response.status !== 429) throw err;
			const retryAfter = parseInt(response.headers.get("retry-after") || "0", 10) * 1000;
			await new Promise((resolve) => setTimeout(resolve, retryAfter));
		}
	}
}

async function queueFetch(url: string, orderHint: number): Promise<void> {
	const existing = inFlightFetches.get(url);
	if (existing) return existing;

	const promise = fetchQueue.addJob(async () => {
		try {
			await fetchPageWithRetry({ url });
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
	const page = await getPage(link.url);
	await parsePageChapter(link.url);
	return page.content || [];
}
