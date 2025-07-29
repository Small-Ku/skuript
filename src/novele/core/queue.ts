import type { Link } from "./extract/links";
import { JobQueue } from "../../util/job-queue";
import { parsePageChapter } from "./extract/chapters";
import { fetchPage, getPage } from "./extract/pages";

interface PageContext {
	pageIndex: number;
	url: string;
}

interface QueueContext {
	currentPageIndex: number;
}

// Create queues for different operations
export const pageQueue = new JobQueue<PageContext, QueueContext, string[]>(
	// Priority function
	(jobContext: PageContext, context: QueueContext) => {
		// Higher priority (lower number) for chapters closer to current chapter
		return Math.abs(jobContext.pageIndex - context.currentPageIndex);
	},
	// Initial context
	{ currentPageIndex: 0 },
	// Options (including concurrency)
	3,
);

// Update current chapter position to adjust priorities
export async function updateCurrentPage(index: number) {
	await pageQueue.setContext({ currentPageIndex: index });
}

// Queue a chapter fetch and parse operation
export async function queueChapterFetch(
	link: Link,
	index: number,
): Promise<string[]> {
	// console.log(`Queueing chapter fetch for ${link.url} at index ${index}`);
	const task = async () => {
		while (pageQueue.getQueueSize()) {
			try {
				await fetchPage(link);
				break; // Exit loop if fetch is successful
			} catch (err: any) {
				console.error(`Error fetching page ${link.url}:`, err);
				const response: Response = err.cause!;
				const retryAfter =
					parseInt(response.headers.get("retry-after") || "0") * 1000;
				await new Promise((resolve) => setTimeout(resolve, retryAfter));
			}
		}
		const page = await getPage(link.url);
		await parsePageChapter(link.url);
		return page.content || [];
	};

	const jobContext = {
		pageIndex: index,
		url: link.url,
	};

	return pageQueue.addJob(async () => {
		try {
			const content = await task();
			return content;
		} catch (error) {
			console.error(`Error fetching chapter:`, error);
			throw error; // Re-throw to handle in the queue
		}
	}, jobContext);
}
