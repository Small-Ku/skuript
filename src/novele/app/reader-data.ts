import van from "vanjs-core";
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
	supported: boolean;
	refs: CommentPageRef[];
	items: CommentItem[];
	error?: string;
};

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
	const currentComments = van.state<CommentViewState>({
		loading: false,
		supported: false,
		refs: [],
		items: [],
	});
	const globalError = van.state<string | null>(null);
	let catalogQueued = false;
	let commentRequestKey = "";

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
				supported: false,
				refs: [],
				items: [],
			};
			return;
		}

		const errors: string[] = [];
		currentComments.val = {
			loading: true,
			supported: true,
			refs,
			items: [],
		};
		void queueCommentFetch(refs, orderHint, (_ref, error) => {
			if (error) errors.push(error instanceof Error ? error.message : `${error}`);
		}).then((bundle) => {
			if (key !== commentRequestKey) return;
			currentComments.val = {
				loading: false,
				supported: bundle.supported,
				refs,
				items: bundle.items,
				error: errors[0],
			};
		});
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
		queueCatalog(nextLinks);
	});

	void resolveLinks(document).catch((error) => {
		globalError.val = error instanceof Error ? error.message : `${error}`;
	});

	const currentLink = van.derive(() => links.val[nav.index.val] ?? null);
	const currentChapterStartUrl = van.derive(() => {
		fetchStates.val;
		const link = currentLink.val;
		if (!link) return undefined;
		return getResolvedChapter(link)?.startUrl ?? link.url;
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

	const goTo = (index: number) => {
		if (!links.val.length) return;
		nav.index.val = Math.max(nav.min.val, Math.min(nav.max.val, index));
	};

	const previous = () => goTo(nav.index.val - 1);
	const next = () => goTo(nav.index.val + 1);

	return {
		links,
		chapterEntries,
		currentLink,
		currentChapterStartUrl,
		currentTitle,
		currentContent,
		currentComments,
		currentStatus,
		globalError,
		loadCurrentComments,
		goTo,
		previous,
		next,
	};
}
