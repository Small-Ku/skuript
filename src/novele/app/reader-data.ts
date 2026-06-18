import van from "vanjs-core";
import {
	CLOUDFLARE_CHALLENGE_MESSAGE,
	type CommentPostResult,
} from "../core/extract/comments";
import { type Link, resolveLinks, subscribeLinks } from "../core/extract/links";
import { findPage } from "../core/extract/pages";
import type { CommentItem, CommentPageRef } from "../core/extract/storage";
import { nav } from "../core/nav";
import { queueCatalogFetch, queueCommentFetch } from "../core/queue";

type ChapterFetchState = {
	loading: boolean;
	error?: string;
};

type ChapterEntry = {
	url: string;
	title: string;
	linkIndex: number;
	chapterIndex?: number;
	extracted: boolean;
};

type CommentViewState = {
	loading: boolean;
	posting: boolean;
	supported: boolean;
	refs: CommentPageRef[];
	items: CommentItem[];
	postId?: string;
	error?: string;
	needsCloudflareVerification: boolean;
};

type PreparedCommentSubmission = {
	author: string;
	text: string;
	refs: CommentPageRef[];
};

export type NavigationMode = "initial" | "previous" | "next" | "jump";

const COMMENT_PREFETCH_RADIUS = 1;

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

export function createReaderData() {
	const links = van.state<Link[]>([]);
	const fetchStates = van.state<Map<string, ChapterFetchState>>(new Map());
	const navigationMode = van.state<NavigationMode>("initial");
	const currentComments = van.state<CommentViewState>({
		loading: false,
		posting: false,
		supported: false,
		refs: [],
		items: [],
		needsCloudflareVerification: false,
	});
	const globalError = van.state<string | null>(null);
	const started = van.state(false);
	let catalogQueued = false;
	let commentRequestKey = "";
	const prefetchedCommentKeys = new Set<string>();
	let resolvePromise: Promise<Link[]> | null = null;

	const updateFetchState = (url: string, state: ChapterFetchState) => {
		const next = new Map(fetchStates.val);
		next.set(url, state);
		fetchStates.val = next;
	};

	const queueCatalog = (nextLinks: Link[]) => {
		if (catalogQueued || !nextLinks.length) return;
		catalogQueued = true;
		const nextFetchStates = new Map(fetchStates.val);
		nextLinks.forEach((link) => {
			nextFetchStates.set(link.url, { loading: true });
		});
		fetchStates.val = nextFetchStates;
		void queueCatalogFetch(nextLinks, (link, _index, error) => {
			const message = error instanceof Error ? error.message : `${error}`;
			updateFetchState(
				link.url,
				error ? { loading: false, error: message } : { loading: false },
			);
		});
	};

	const queueComments = (refs: CommentPageRef[], orderHint: number) => {
		const key = refs.map((ref) => ref.url).join("\n");
		if (key === commentRequestKey) return;
		commentRequestKey = key;
		if (!refs.length) {
			currentComments.val = {
				loading: false,
				posting: false,
				supported: false,
				refs: [],
				items: [],
				needsCloudflareVerification: false,
			};
			return;
		}

		const errors: string[] = [];
		currentComments.val = {
			loading: true,
			posting: false,
			supported: true,
			refs,
			items: [],
			needsCloudflareVerification: false,
		};
		void queueCommentFetch(refs, orderHint, (_ref, error, bundle) => {
			if (error)
				errors.push(error instanceof Error ? error.message : `${error}`);
			if (!bundle || key !== commentRequestKey) return;
			currentComments.val = {
				...currentComments.val,
				loading: true,
				supported: bundle.supported,
				refs,
				items: bundle.items,
				postId: bundle.postId,
				error: errors[0],
			};
		}).then((bundle) => {
			if (key !== commentRequestKey) return;
			currentComments.val = {
				loading: false,
				posting: false,
				supported: bundle.supported,
				refs,
				items: bundle.items,
				postId: bundle.postId,
				error: errors[0],
				needsCloudflareVerification: false,
			};
		});
	};

	const prefetchComments = (refs: CommentPageRef[], orderHint: number) => {
		if (!refs.length) return;
		const key = refs.map((ref) => ref.url).join("\n");
		if (prefetchedCommentKeys.has(key)) return;
		prefetchedCommentKeys.add(key);
		void queueCommentFetch(refs, orderHint);
	};

	subscribeLinks((nextLinks) => {
		links.val = nextLinks;
		nav.min.val = 0;
		nav.max.val = Math.max(0, nextLinks.length - 1);
		const currentUrl = normalizeReaderUrl(window.location.href);
		const currentPageIndex = nextLinks.findIndex(
			(link) => normalizeReaderUrl(link.url) === currentUrl,
		);
		if (currentPageIndex >= 0) {
			nav.index.val = currentPageIndex;
		}
		if (nav.index.val > nav.max.val) {
			nav.index.val = nav.max.val;
		}
		if (started.val) {
			queueCatalog(nextLinks);
		}
	});

	const start = () => {
		if (started.val) return;
		started.val = true;
		queueCatalog(links.val);
		resolvePromise ??= resolveLinks(document).catch((error) => {
			globalError.val = error instanceof Error ? error.message : `${error}`;
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
			return findPage(link.url).resolvedChapter?.content ?? [];
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
	): PreparedCommentSubmission | null => {
		const state = currentComments.val;
		const commentText = text.trim();
		if (!state.supported || !state.postId || !commentText || state.posting) {
			return null;
		}

		const normalizedAuthor = author.trim() || "匿名";
		currentComments.val = {
			...state,
			posting: true,
			error: undefined,
			needsCloudflareVerification: false,
		};
		return {
			author: normalizedAuthor,
			text: commentText,
			refs: state.refs,
		};
	};
	const completeCurrentCommentSubmission = (bundle: CommentPostResult) => {
		currentComments.val = {
			loading: false,
			posting: false,
			supported: bundle.supported,
			refs: bundle.refs,
			items: bundle.items,
			postId: bundle.postId,
			needsCloudflareVerification: false,
		};
	};
	const failCurrentCommentSubmission = (error: unknown) => {
		const message = error instanceof Error ? error.message : `${error}`;
		currentComments.val = {
			...currentComments.val,
			posting: false,
			error: message,
			needsCloudflareVerification: message === CLOUDFLARE_CHALLENGE_MESSAGE,
		};
	};
	const currentStatus = van.derive(() => {
		const link = currentLink.val;
		if (!link) return { loading: false, error: globalError.val };
		return fetchStates.val.get(link.url) ?? { loading: false };
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

	const goTo = (index: number, mode: NavigationMode = "jump") => {
		if (!links.val.length) return;
		const nextIndex = Math.max(nav.min.val, Math.min(nav.max.val, index));
		if (nextIndex === nav.index.val) return;
		navigationMode.val = mode;
		nav.index.val = nextIndex;
	};

	const previous = () => goTo(nav.index.val - 1, "previous");
	const next = () => goTo(nav.index.val + 1, "next");

	return {
		links,
		started,
		navigationMode,
		chapterEntries,
		currentLink,
		currentChapterStartUrl,
		currentCommentsAvailable,
		currentTitle,
		currentContent,
		currentComments,
		currentStatus,
		globalError,
		loadCurrentComments,
		prepareCurrentCommentSubmission,
		completeCurrentCommentSubmission,
		failCurrentCommentSubmission,
		start,
		goTo,
		previous,
		next,
	};
}
