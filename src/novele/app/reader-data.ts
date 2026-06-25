import van from "vanjs-core";
import { batchRaf, createFrameCoalescer } from "../../util/batch";
import {
	CLOUDFLARE_CHALLENGE_MESSAGE,
	type CommentPostResult,
} from "../core/extract/comments";
import { type Link, resolveLinks, subscribeLinks } from "../core/extract/links";
import { findPage } from "../core/extract/pages";
import type { CommentItem, CommentPageRef } from "../core/extract/storage";
import { createNoveleLogger } from "../core/log";
import { nav } from "../core/nav";
import {
	readSessionChapterProgress,
	writeSessionChapterProgress,
} from "../core/progress";
import {
	queueCatalogFetch,
	queueCommentFetch,
	updateCurrentPage,
} from "../core/queue";

type ChapterFetchState = {
	isLoading: boolean;
	error?: string;
};

export type ChapterEntry = {
	url: string;
	title: string;
	linkIndex: number;
	chapterIndex?: number;
	extracted: boolean;
};

type CommentViewState = {
	isLoading: boolean;
	posting: boolean;
	commentingAvailable: boolean;
	refs: CommentPageRef[];
	items: CommentItem[];
	postId?: string;
	error?: string;
	needsCloudflareVerification: boolean;
	waitingForCloudflareVerification: boolean;
};

type PreparedCommentSubmission = {
	author: string;
	text: string;
	refs: CommentPageRef[];
	parentId: string | null;
};

export enum NavigationMode {
	Initial = 0,
	Previous = 1,
	Next = 2,
	Jump = 3,
}

const COMMENT_PREFETCH_RADIUS = 1;
const logger = createNoveleLogger("reader-data");

function normalizeReaderUrl(url: string) {
	const parsed = new URL(url);
	parsed.hash = "";
	parsed.pathname = parsed.pathname.replace(/\/comment-page-\d+\/?$/, "");
	return parsed.href;
}

function getPageTitle(link: Link): string {
	try {
		const page = findPage(link.url);
		const title =
			page.resolvedChapter?.title ??
			Array.from(page.title ?? []).find((item) => item.trim());
		return title ?? link.title ?? `Chapter ${nav.index.val + 1}`;
	} catch {
		return link.title ?? `Chapter ${nav.index.val + 1}`;
	}
}

function getResolvedChapter(link: Link) {
	try {
		return findPage(link.url).resolvedChapter;
	} catch {
		return undefined;
	}
}

function findChapterLinkIndex(nextLinks: Link[], chapterUrl: string) {
	const normalizedTarget = normalizeReaderUrl(chapterUrl);
	const exactMatchIndex = nextLinks.findIndex(
		(link) => normalizeReaderUrl(link.url) === normalizedTarget,
	);
	if (exactMatchIndex >= 0) return exactMatchIndex;
	return nextLinks.findIndex((link) => {
		const startUrl = getResolvedChapter(link)?.startUrl;
		return startUrl ? normalizeReaderUrl(startUrl) === normalizedTarget : false;
	});
}

export function createReaderData() {
	const links = van.state<Link[]>([]);
	const fetchStates = van.state<Map<string, ChapterFetchState>>(new Map());
	const navMode = van.state<NavigationMode>(NavigationMode.Initial);
	const currentComments = van.state<CommentViewState>({
		isLoading: false,
		posting: false,
		commentingAvailable: false,
		refs: [],
		items: [],
		needsCloudflareVerification: false,
		waitingForCloudflareVerification: false,
	});
	const globalError = van.state<string | null>(null);
	let started = false;
	let catalogQueued = false;
	let commentRequestKey = "";
	const prefetchedCommentKeys = new Set<string>();

	const queueCatalog = (nextLinks: Link[]) => {
		if (catalogQueued || !nextLinks.length) return;
		catalogQueued = true;
		logger.info("queueing catalog fetch", {
			linkCount: nextLinks.length,
		});
		const nextFetchStates = new Map(fetchStates.val);
		nextLinks.forEach((link) => {
			nextFetchStates.set(link.url, { isLoading: true });
		});
		fetchStates.val = nextFetchStates;

		const batchUpdate = batchRaf<[string, ChapterFetchState]>((updates) => {
			const next = new Map(fetchStates.val);
			for (const [url, state] of updates) {
				next.set(url, state);
			}
			fetchStates.val = next;
		});

		void queueCatalogFetch(nextLinks, (link, _index, error) => {
			const message = error instanceof Error ? error.message : `${error}`;
			if (error) {
				logger.warn("catalog fetch entry failed", {
					url: link.url,
					message,
				});
			}
			batchUpdate([
				link.url,
				error ? { isLoading: false, error: message } : { isLoading: false },
			]);
		});
	};

	const queueComments = (refs: CommentPageRef[], orderHint: number) => {
		const key = refs.map((ref) => ref.url).join("\n");
		if (key === commentRequestKey) return;
		commentRequestKey = key;
		if (!refs.length) {
			logger.debug("cleared current comments because no refs were available", {
				orderHint,
			});
			currentComments.val = {
				isLoading: false,
				posting: false,
				commentingAvailable: false,
				refs: [],
				items: [],
				needsCloudflareVerification: false,
				waitingForCloudflareVerification: false,
			};
			return;
		}

		const errors: string[] = [];
		logger.info("loading current comments", {
			refCount: refs.length,
			orderHint,
		});
		currentComments.val = {
			isLoading: true,
			posting: false,
			commentingAvailable: true,
			refs,
			items: [],
			needsCloudflareVerification: false,
			waitingForCloudflareVerification: false,
		};

		const updateCommentsState = createFrameCoalescer<CommentViewState>(
			() => currentComments.val,
			(nextState) => {
				currentComments.val = nextState;
			},
		);

		void queueCommentFetch(refs, orderHint, (_ref, error, bundle) => {
			if (error) {
				logger.warn("comment page fetch failed", {
					url: _ref.url,
					pageNumber: _ref.pageNumber,
					message: error instanceof Error ? error.message : `${error}`,
				});
				errors.push(error instanceof Error ? error.message : `${error}`);
			}
			if (!bundle || key !== commentRequestKey) return;
			updateCommentsState({
				isLoading: true,
				commentingAvailable: bundle.commentingAvailable,
				refs,
				items: bundle.items,
				postId: bundle.postId,
				error: errors[0],
				waitingForCloudflareVerification: false,
			});
		}).then((bundle) => {
			if (key !== commentRequestKey) return;
			logger.info("loaded current comments", {
				refCount: refs.length,
				itemCount: bundle.items.length,
				commentingAvailable: bundle.commentingAvailable,
			});
			updateCommentsState(
				{
					isLoading: false,
					posting: false,
					commentingAvailable: bundle.commentingAvailable,
					refs,
					items: bundle.items,
					postId: bundle.postId,
					error: errors[0],
					needsCloudflareVerification: false,
					waitingForCloudflareVerification: false,
				},
				true,
			);
		});
	};

	const prefetchComments = (refs: CommentPageRef[], orderHint: number) => {
		if (!refs.length) return;
		const key = refs.map((ref) => ref.url).join("\n");
		if (prefetchedCommentKeys.has(key)) return;
		prefetchedCommentKeys.add(key);
		logger.debug("prefetching nearby comments", {
			refCount: refs.length,
			orderHint,
		});
		void queueCommentFetch(refs, orderHint);
	};

	subscribeLinks((nextLinks) => {
		links.val = nextLinks;
		nav.min.val = 0;
		nav.max.val = Math.max(0, nextLinks.length - 1);
		const currentUrl = normalizeReaderUrl(window.location.href);
		const storedProgress = readSessionChapterProgress();
		const storedIndex = storedProgress
			? findChapterLinkIndex(nextLinks, storedProgress.chapterUrl)
			: -1;
		const currentPageIndex = nextLinks.findIndex(
			(link) => normalizeReaderUrl(link.url) === currentUrl,
		);
		if (storedIndex >= 0) {
			nav.index.val = storedIndex;
		} else if (currentPageIndex >= 0) {
			nav.index.val = currentPageIndex;
		}
		logger.info("resolved chapter links", {
			linkCount: nextLinks.length,
			storedIndex,
			currentPageIndex,
			selectedIndex: nav.index.val,
		});
		if (nav.index.val > nav.max.val) {
			nav.index.val = nav.max.val;
		}
		if (started) {
			void updateCurrentPage(nav.index.val).then(() => {
				queueCatalog(nextLinks);
			});
		}
	});

	const start = () => {
		if (started) return;
		started = true;
		logger.info("starting reader data pipeline", {
			initialLinkCount: links.val.length,
			href: window.location.href,
		});
		queueCatalog(links.val);
		void resolveLinks(document).catch((error) => {
			globalError.val = error instanceof Error ? error.message : `${error}`;
			logger.error("failed to resolve chapter links", {
				message: globalError.val,
			});
			throw error;
		});
	};

	const currentLink = van.derive(() => links.val[nav.index.val] ?? null);
	const currentChapterStartUrl = van.derive(() => {
		fetchStates.val;
		const link = currentLink.val;
		if (!link) return undefined;
		return getResolvedChapter(link)?.startUrl ?? link.url;
	});
	van.derive(() => {
		const link = currentLink.val;
		const chapterUrl = currentChapterStartUrl.val;
		if (!link || !chapterUrl) return;
		writeSessionChapterProgress({
			chapterUrl,
			linkIndex: nav.index.val,
			title: getPageTitle(link),
		});
	});
	const currentCommentsAvailable = van.derive(() => {
		fetchStates.val;
		const link = currentLink.val;
		if (!link) return false;
		return (getResolvedChapter(link)?.commentPages.length ?? 0) > 0;
	});
	const currentTitle = van.derive(() => {
		fetchStates.val;
		const link = currentLink.val;
		return link ? getPageTitle(link) : document.title || "Novelé";
	});
	const currentContent = van.derive(() => {
		fetchStates.val;
		const link = currentLink.val;
		if (!link) return [] as string[];
		try {
			return findPage(link.url).resolvedChapter?.textLines ?? [];
		} catch {
			return [] as string[];
		}
	});
	van.derive(() => {
		fetchStates.val;
		const nextLinks = links.val;
		const currentIndex = nav.index.val;
		for (
			let index = Math.max(0, currentIndex - COMMENT_PREFETCH_RADIUS);
			index <=
			Math.min(nextLinks.length - 1, currentIndex + COMMENT_PREFETCH_RADIUS);
			index += 1
		) {
			const chapter = getResolvedChapter(nextLinks[index]);
			prefetchComments(chapter?.commentPages ?? [], index);
		}
	});
	const loadCurrentComments = () => {
		fetchStates.val;
		const link = currentLink.val;
		logger.debug("requested current comments load", {
			currentIndex: nav.index.val,
			url: link?.url,
		});
		if (!link) {
			queueComments([], nav.index.val);
			return;
		}
		const chapter = getResolvedChapter(link);
		queueComments(chapter?.commentPages ?? [], nav.index.val);
	};
	const prepareCurrentCommentSubmission = (
		author: string,
		text: string,
		parentId: string | null,
	): PreparedCommentSubmission | null => {
		const state = currentComments.val;
		const commentText = text.trim();
		if (
			!state.commentingAvailable ||
			!state.postId ||
			!commentText ||
			state.posting
		) {
			logger.debug("skipped comment submission preparation", {
				commentingAvailable: state.commentingAvailable,
				hasPostId: Boolean(state.postId),
				hasCommentText: Boolean(commentText),
				posting: state.posting,
			});
			return null;
		}

		const normalizedAuthor = author.trim() || "匿名";
		logger.info("prepared comment submission", {
			refCount: state.refs.length,
			replyingToCommentId: parentId,
			authorProvided: Boolean(author.trim()),
		});
		currentComments.val = {
			...state,
			posting: true,
			error: undefined,
			needsCloudflareVerification: false,
			waitingForCloudflareVerification: false,
		};
		return {
			author: normalizedAuthor,
			text: commentText,
			refs: state.refs,
			parentId,
		};
	};
	const completeCurrentCommentSubmission = (bundle: CommentPostResult) => {
		logger.info("completed comment submission", {
			refCount: bundle.refs.length,
			itemCount: bundle.items.length,
			commentingAvailable: bundle.commentingAvailable,
		});
		currentComments.val = {
			isLoading: false,
			posting: false,
			commentingAvailable: bundle.commentingAvailable,
			refs: bundle.refs,
			items: bundle.items,
			postId: bundle.postId,
			needsCloudflareVerification: false,
			waitingForCloudflareVerification: false,
		};
	};
	const failCurrentCommentSubmission = (
		error: unknown,
		options?: { waitingForCloudflareVerification?: boolean },
	) => {
		const message = error instanceof Error ? error.message : `${error}`;
		const needsCloudflareVerification =
			message === CLOUDFLARE_CHALLENGE_MESSAGE;
		logger.warn("failed comment submission", {
			message,
			needsCloudflareVerification,
			waitingForCloudflareVerification: Boolean(
				options?.waitingForCloudflareVerification,
			),
		});
		currentComments.val = {
			...currentComments.val,
			posting: false,
			error: message,
			needsCloudflareVerification,
			waitingForCloudflareVerification:
				needsCloudflareVerification &&
				Boolean(options?.waitingForCloudflareVerification),
		};
	};
	const currentStatus = van.derive(() => {
		const link = currentLink.val;
		if (!link) return { isLoading: false, error: globalError.val };
		return fetchStates.val.get(link.url) ?? { isLoading: false };
	});
	const chapterEntries = van.derive(() => {
		fetchStates.val;
		const resolved = links.val.flatMap((link, linkIndex): ChapterEntry[] => {
			const chapter = getResolvedChapter(link);
			if (!chapter?.title || chapter.boundaryMode !== "marker-bounded") {
				return [];
			}
			return [
				{
					url: chapter.startUrl ?? link.url,
					title: chapter.title,
					linkIndex: chapter.startLinkIndex ?? linkIndex,
					chapterIndex: chapter.chapterIndex,
					extracted: true,
				},
			];
		});
		const seen = new Set<string>();
		const extracted = resolved.filter((entry) => {
			const key = `${entry.chapterIndex ?? ""}:${entry.url}:${entry.title}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});
		if (extracted.length) return extracted;
		return links.val.map((link, linkIndex) => ({
			url: link.url,
			title: getPageTitle(link),
			linkIndex,
			extracted: false,
		}));
	});

	const goTo = (index: number, mode: NavigationMode = NavigationMode.Jump) => {
		if (!links.val.length) return;
		const nextIndex = Math.max(nav.min.val, Math.min(nav.max.val, index));
		if (nextIndex === nav.index.val) return;
		logger.info("navigating reader", {
			fromIndex: nav.index.val,
			toIndex: nextIndex,
			mode,
		});
		navMode.val = mode;
		nav.index.val = nextIndex;
	};

	const getCurrentChapterIndex = () => {
		return chapterEntries.val.findIndex((entry, idx) => {
			const nextEntry = chapterEntries.val[idx + 1];
			return (
				nav.index.val >= entry.linkIndex &&
				(!nextEntry || nav.index.val < nextEntry.linkIndex)
			);
		});
	};

	const goToChapter = (
		chapterIndex: number,
		mode: NavigationMode = NavigationMode.Jump,
	) => {
		const targetIndex = Math.max(
			0,
			Math.min(chapterEntries.val.length - 1, chapterIndex),
		);
		const entry = chapterEntries.val[targetIndex];
		if (entry) {
			goTo(entry.linkIndex, mode);
		}
	};

	const previous = () => {
		const currentIdx = getCurrentChapterIndex();
		if (currentIdx > 0) {
			goToChapter(currentIdx - 1, NavigationMode.Previous);
		} else {
			goTo(nav.index.val - 1, NavigationMode.Previous);
		}
	};

	const next = () => {
		const currentIdx = getCurrentChapterIndex();
		if (currentIdx >= 0 && currentIdx < chapterEntries.val.length - 1) {
			goToChapter(currentIdx + 1, NavigationMode.Next);
		} else {
			goTo(nav.index.val + 1, NavigationMode.Next);
		}
	};

	return {
		links,
		navMode,
		chapterEntries,
		currentLink,
		currentChapterStartUrl,
		currentCommentsAvailable,
		currentTitle,
		currentContent,
		currentComments,
		currentStatus,
		loadCurrentComments,
		prepareCurrentCommentSubmission,
		completeCurrentCommentSubmission,
		failCurrentCommentSubmission,
		start,
		goTo,
		goToChapter,
		previous,
		next,
	};
}
