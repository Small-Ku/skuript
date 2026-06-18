import { JobQueue } from "../../util/job-queue";
import { resolvePageChapter } from "./extract/chapters";
import {
	getCachedCommentBundle,
	parseCommentPage,
	type CommentBundle,
	type CommentPostResult,
	postSiteComment,
} from "./extract/comments";
import type { Link } from "./extract/links";
import type { CommentPageRef } from "./extract/storage";
import {
	getAdditionalPageUrls,
	getPage,
	parsePageDom,
	parseStandalonePage,
	peekPage,
	registerCurrentPage,
	registerPageRaw,
	releasePageDom,
	setAdditionalPageUrls,
} from "./extract/pages";

interface FetchContext {
	kind: "page" | "comment" | "comment-post";
	orderHint: number;
	pageNumber?: number;
	url: string;
}

interface QueueContext {
	currentOrderHint: number;
}

const fetchQueue = new JobQueue<FetchContext, QueueContext, unknown>(
	(jobContext, context) => {
		if (jobContext.kind === "comment-post") return -1_000_000;
		const distance = Math.abs(jobContext.orderHint - context.currentOrderHint);
		if (jobContext.kind === "comment") {
			if (jobContext.pageNumber === 1 || distance <= 1) {
				return 100 + distance + (jobContext.pageNumber ?? 0) / 1000;
			}
			return 10_000 + distance + (jobContext.pageNumber ?? 0) / 1000;
		}
		return distance;
	},
	{ currentOrderHint: 0 },
	3,
);

const inFlightFetches = new Map<string, Promise<void>>();
const CHAPTER_LOOKAHEAD = 6;

async function waitForRetryAfter(response: Response) {
	const retryAfter = response.headers.get("retry-after");
	const seconds = Number(retryAfter);
	const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000;
	await new Promise((resolve) => setTimeout(resolve, delay));
}

async function fetchWith429Retry(
	input: RequestInfo | URL,
	init?: RequestInit,
): Promise<Response> {
	for (;;) {
		const response = await fetch(input, init);
		if (response.status !== 429) return response;
		await waitForRetryAfter(response);
	}
}

async function fetchPageText(url: string): Promise<string> {
	if (url === window.location.href) return document.documentElement.outerHTML;
	const storedPage = peekPage(url);
	if (storedPage?.raw) {
		console.debug(`Using cached raw page: ${url}`);
		return storedPage.raw;
	}
	for (;;) {
		const response = await fetchWith429Retry(url, { cache: "force-cache" });
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
	context: Pick<FetchContext, "kind" | "pageNumber"> = { kind: "page" },
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
		{ ...context, url, orderHint },
	) as Promise<void>;
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
	context: Pick<FetchContext, "kind" | "pageNumber"> = { kind: "page" },
): Promise<Document> {
	await queueFetch(url, orderHint, true, context);
	const page = await parsePageDom(url);
	if (!page.dom) throw new Error(`page DOM not available: ${url}`);
	return page.dom;
}

export async function queueCommentFetch(
	refs: CommentPageRef[],
	orderHint = 0,
	onSettled?: (
		ref: CommentPageRef,
		error?: unknown,
		bundle?: CommentBundle,
	) => void,
): Promise<CommentBundle> {
	await Promise.allSettled(
		refs.map((ref) =>
			fetchDocument(ref.url, orderHint + ref.pageNumber / 100, {
				kind: "comment",
				pageNumber: ref.pageNumber,
			})
				.then((doc) => {
					parseCommentPage(doc, ref);
					onSettled?.(ref, undefined, getCachedCommentBundle(refs));
					releasePageDom(ref.url);
				})
				.catch((error) => {
					onSettled?.(ref, error);
					releasePageDom(ref.url);
					throw error;
				}),
		),
	);
	return getCachedCommentBundle(refs);
}

export async function queueSiteCommentPost(
	refs: CommentPageRef[],
	author: string,
	text: string,
	postId: string,
	orderHint = 0,
	replyId?: string,
): Promise<CommentPostResult> {
	return fetchQueue.addJob(
		() =>
			postSiteComment(
				refs,
				author,
				text,
				postId,
				replyId,
				(input, init) => fetchWith429Retry(input, init),
			),
		{ kind: "comment-post", url: "comment-post", orderHint },
	) as Promise<CommentPostResult>;
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
