import { FpsConcurrencyController } from "../../util/fps-throttle";
import { JobQueue } from "../../util/job-queue";
import { hydrateResolvedChapter, resolvePageChapter } from "./extract/chapters";
import {
	type CommentBundle,
	getCachedCommentBundle,
	parseCommentPage,
} from "./extract/comments";
import {
	canUseCurrentDocument,
	normalizeFetchUrl,
} from "./extract/hostname-map";
import type { Link } from "./extract/links";
import {
	getAdditionalPageUrls,
	getPage,
	hydratePage,
	parsePageDom,
	parseStandalonePage,
	peekPage,
	registerCurrentPage,
	registerPageRaw,
	releasePageDom,
	setAdditionalPageUrls,
} from "./extract/pages";
import type { CommentPageRef } from "./extract/storage";
import { createNoveleLogger } from "./log";

interface FetchContext {
	kind: "page" | "comment" | "comment-post";
	orderHint: number;
	pageNumber?: number;
	url: string;
}

interface QueueContext {
	currentOrderHint: number;
}

// fpsThrottle is assigned immediately after fetchQueue; the onActiveChange closure
// is only ever invoked after addJob(), which occurs after module init completes.
let fpsThrottle: FpsConcurrencyController<FetchContext, QueueContext, unknown>;
const logger = createNoveleLogger("queue");

const fetchQueue = new JobQueue<FetchContext, QueueContext, unknown>(
	(jobContext, context) => {
		if (jobContext.kind === "comment-post") return -1_000_000;
		const distance = Math.abs(jobContext.orderHint - context.currentOrderHint);
		if (jobContext.kind === "comment") {
			if (distance === 0) {
				return -100 + (jobContext.pageNumber ?? 0) / 1000;
			}
			if (jobContext.pageNumber === 1 || distance <= 1) {
				return 10 + distance + (jobContext.pageNumber ?? 0) / 1000;
			}
			return 10_000 + distance + (jobContext.pageNumber ?? 0) / 1000;
		}
		return distance;
	},
	{ currentOrderHint: 0 },
	32,
	{ onActiveChange: (active) => fpsThrottle.onActiveChange(active) },
);

fpsThrottle = new FpsConcurrencyController(fetchQueue, {
	/** @dev-only */
	onMonitoringChange(active) {
		logger.info(
			active
				? "started FPS concurrency monitoring"
				: "stopped FPS concurrency monitoring",
			{
				queueSize: fetchQueue.getQueueSize(),
				runningJobs: fetchQueue.getRunningJobsCount(),
			},
		);
	},
	/** @dev-only */
	onConcurrencyChange({
		previousConcurrency,
		nextConcurrency,
		averageFrameMs,
		currentK,
	}) {
		logger.info("adjusted fetch queue concurrency", {
			previousConcurrency,
			nextConcurrency,
			currentK: Number(currentK.toFixed(6)),
			averageFrameMs: Number(averageFrameMs.toFixed(2)),
			queueSize: fetchQueue.getQueueSize(),
			runningJobs: fetchQueue.getRunningJobsCount(),
		});
	},
});

const inFlightFetches = new Map<string, Promise<void>>();
const CHAPTER_LOOKAHEAD = 6;

async function waitForRetryAfter(response: Response) {
	const retryAfter = response.headers.get("retry-after");
	const seconds = Number(retryAfter);
	const delay = Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 1000;
	logger.warn("fetch hit HTTP 429, waiting before retry", {
		url: response.url,
		retryAfter,
		delayMs: delay,
	});
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

async function fetchPageText(
	url: string,
	bypassCache = false,
): Promise<string> {
	const fetchUrl = normalizeFetchUrl(url);
	if (!bypassCache && fetchUrl === window.location.href)
		return document.documentElement.outerHTML;
	if (!bypassCache) {
		const storedPage = peekPage(url);
		const storedRaw = storedPage?.raw ?? storedPage?.persistedRaw;
		if (storedRaw) {
			logger.debug("using cached raw page", { url });
			return storedRaw;
		}
		const hydratedPage = await hydratePage(url);
		const hydratedRaw = hydratedPage?.raw ?? hydratedPage?.persistedRaw;
		if (hydratedRaw) {
			logger.debug("using IndexedDB page", { url });
			return hydratedRaw;
		}
	}
	for (;;) {
		logger.debug("fetching page text", {
			url,
			fetchUrl,
			bypassCache,
		});
		const response = await fetchWith429Retry(
			fetchUrl,
			bypassCache ? { cache: "no-store" } : { cache: "force-cache" },
		);
		if (!response.ok) {
			logger.error("page fetch failed", {
				url,
				fetchUrl,
				status: response.status,
				statusText: response.statusText,
			});
			throw new Error("ERROR", { cause: response });
		}
		logger.debug("fetched page text", {
			url,
			fetchUrl,
			status: response.status,
		});
		return response.text();
	}
}

async function performQueueFetch(ctx: FetchContext): Promise<void> {
	const isCommentPost = ctx.kind === "comment-post";
	try {
		logger.debug("starting queued fetch", ctx);
		if (!isCommentPost && canUseCurrentDocument(ctx.url)) {
			logger.debug("using current document for queued fetch", {
				url: ctx.url,
				kind: ctx.kind,
			});
			registerCurrentPage(ctx.url);
			return;
		}
		registerPageRaw(ctx.url, await fetchPageText(ctx.url, isCommentPost));
		logger.debug("stored queued fetch result", ctx);
	} finally {
		inFlightFetches.delete(ctx.url);
	}
}

async function queueFetch(
	url: string,
	orderHint: number,
	requireDocument = false,
	context: Pick<FetchContext, "kind" | "pageNumber"> = { kind: "page" },
): Promise<void> {
	const isCommentPost = context.kind === "comment-post";
	if (!isCommentPost) {
		const cachedPage = peekPage(url);
		if (cachedPage?.raw || cachedPage?.dom) return;
		if (cachedPage?.slices?.length && !requireDocument) return;
	}

	const existing = inFlightFetches.get(url);
	if (existing) {
		logger.debug("reusing in-flight fetch", {
			url,
			kind: context.kind,
		});
		return existing;
	}

	const promise = fetchQueue.addJob(performQueueFetch, {
		...context,
		url,
		orderHint,
	}) as Promise<void>;
	logger.debug("queued fetch", {
		url,
		orderHint,
		requireDocument,
		kind: context.kind,
		pageNumber: context.pageNumber,
	});
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
	logger.debug("updated queue context for current page", { index });
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
	logger.info("queueing comment fetch", {
		refCount: refs.length,
		orderHint,
	});
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
	logger.info("completed comment fetch", {
		refCount: refs.length,
	});
	return getCachedCommentBundle(refs);
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
	await hydrateResolvedChapter(link.url, orderedUrls);
	let chapter = resolvePageChapter(link.url, orderedUrls);
	for (
		let nextIndex = index + CHAPTER_LOOKAHEAD;
		!chapter.isComplete && nextIndex < orderedLinks.length;
		nextIndex += 1
	) {
		await ensureLinkParsed(orderedLinks[nextIndex], nextIndex);
		chapter = resolvePageChapter(link.url, orderedUrls);
	}
	return chapter.textLines;
}

export async function queueCatalogFetch(
	orderedLinks: Link[],
	onSettled?: (link: Link, index: number, error?: unknown) => void,
): Promise<void> {
	const orderedUrls = orderedLinks.map((item) => item.url);
	await Promise.allSettled(
		orderedLinks.map((link, index) =>
			ensureLinkParsed(link, index)
				.then(async () => {
					for (
						let resolveIndex = Math.max(0, index - CHAPTER_LOOKAHEAD);
						resolveIndex <= index;
						resolveIndex += 1
					) {
						await hydrateResolvedChapter(
							orderedLinks[resolveIndex].url,
							orderedUrls,
						);
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
