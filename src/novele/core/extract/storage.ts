export type ChapterCandidate = {
	index: number;
	series: "main" | "extra";
	line: number;
	title?: string;
	isStandalone: boolean;
	chapterSource: "content" | "title";
	matchPattern?: "chapter" | "numbered" | "ending" | "extra" | "book-title";
};

export type CommentScope = "catalog" | "chapter" | "page";

export type CommentPageRef = {
	url: string;
	scope: CommentScope;
	pageNumber: number;
	ownerUrl?: string;
};

export type CommentItem = {
	id: string;
	author: string;
	text: string[];
	time: string;
	parentId?: string;
	pageNumber: number;
	sourceUrl: string;
};

export type PageSlice = {
	url: string;
	parentUrl: string;
	subPageIndex: number;
	title: string[];
	textLines: string[];
	chapterCandidates?: ChapterCandidate[];
	commentPages?: CommentPageRef[];
};

export type ChapterBoundaryMode = "marker-bounded" | "link-bounded";

export type ResolvedChapter = {
	title?: string;
	textLines: string[];
	chapterIndex?: number;
	startUrl?: string;
	startLinkIndex?: number;
	boundaryMode: ChapterBoundaryMode;
	isComplete: boolean;
	commentPages: CommentPageRef[];
	resolvedPageKey?: string;
	resolvedThroughLinkIndex?: number;
};

export type StoredPage = {
	url: string;
	lastModified: Date;
	title: Set<string>;
	slices?: PageSlice[];
	resolvedChapter?: ResolvedChapter;
	additionalUrls?: string[];
	raw?: string;
	dom?: Document;
};

/** @mangle-preserve Persisted as JSON in sessionStorage. */
type SessionPage = {
	version: number;
	lastModified: string;
	title: string[];
	additionalUrls?: string[];
	raw?: string;
};

const pages = new Map<string, StoredPage>();
const STORAGE_VERSION = 4;

function clearStoredPageCache() {
	for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
		const key = sessionStorage.key(index);
		if (key?.startsWith("http")) sessionStorage.removeItem(key);
	}
}

function toSessionPage(page: StoredPage): SessionPage {
	return {
		version: STORAGE_VERSION,
		lastModified: page.lastModified.toISOString(),
		title: [...page.title],
		additionalUrls: page.additionalUrls,
		raw: page.slices?.length ? undefined : page.raw,
	};
}

function fromSessionPage(url: string, page: SessionPage): StoredPage {
	return {
		url,
		lastModified: new Date(page.lastModified),
		title: new Set(page.title),
		additionalUrls: page.additionalUrls,
		raw: page.raw,
	};
}

function loadPage(url: string): StoredPage | undefined {
	const stored = sessionStorage.getItem(url);
	if (!stored) return;
	const sessionPage = JSON.parse(stored) as Partial<SessionPage>;
	if (sessionPage.version !== STORAGE_VERSION) {
		sessionStorage.removeItem(url);
		return;
	}
	const page = fromSessionPage(url, sessionPage as SessionPage);
	pages.set(url, page);
	return page;
}

export function getPage(url: string): StoredPage | undefined {
	return pages.get(url) ?? loadPage(url);
}

export function hasPage(url: string): boolean {
	return getPage(url) !== undefined;
}

export function setPage(page: StoredPage): StoredPage {
	pages.set(page.url, page);
	try {
		sessionStorage.setItem(page.url, JSON.stringify(toSessionPage(page)));
	} catch (error) {
		if (error instanceof DOMException && error.name === "QuotaExceededError") {
			clearStoredPageCache();
		} else {
			throw error;
		}
	}
	return page;
}

export function deletePage(url: string): void {
	pages.delete(url);
	sessionStorage.removeItem(url);
}
