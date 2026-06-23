import { storage } from "../storage";
import type { PersistedPageRecord } from "../storage/types";

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
	lastChanged: Date;
	title: Set<string>;
	slices?: PageSlice[];
	resolvedChapter?: ResolvedChapter;
	additionalUrls?: string[];
	raw?: string;
	persistedRaw?: string;
	dom?: Document;
};

/** @mangle-preserve Persisted in IndexedDB page cache. */
type SessionPage = PersistedPageRecord;
const STORAGE_VERSION = 1;

function toSessionPage(page: StoredPage): SessionPage {
	const timestamp = Date.now();
	const raw = page.raw ?? page.persistedRaw;
	return {
		schemaVersion: STORAGE_VERSION,
		lastChanged: page.lastChanged.toISOString(),
		title: [...page.title],
		additionalUrls: page.additionalUrls,
		raw,
		createdAt: timestamp,
		updatedAt: timestamp,
		lastAccess: timestamp,
		approxSize: raw?.length ?? 0,
	};
}

function fromSessionPage(url: string, page: SessionPage): StoredPage {
	return {
		url,
		lastChanged: new Date(page.lastChanged),
		title: new Set(page.title),
		additionalUrls: page.additionalUrls,
		persistedRaw: page.raw,
	};
}

export async function hydratePage(
	url: string,
): Promise<StoredPage | undefined> {
	const sessionPage = (await storage.pageCache.get(url)) as
		| Partial<SessionPage>
		| undefined;
	if (!sessionPage) return;
	if (sessionPage.schemaVersion !== STORAGE_VERSION) {
		void storage.pageCache.delete(url);
		return;
	}
	const page = fromSessionPage(url, sessionPage as SessionPage);
	storage.runtimePages.set(url, page);
	return page;
}

export function getPage(url: string): StoredPage | undefined {
	return storage.runtimePages.get(url) as StoredPage | undefined;
}

export function hasPage(url: string): boolean {
	return getPage(url) !== undefined;
}

export function setPage(page: StoredPage): StoredPage {
	storage.runtimePages.set(page.url, page);
	return page;
}

export function commitPage(page: StoredPage): StoredPage {
	storage.runtimePages.set(page.url, page);
	void storage.pageCache.put(page.url, toSessionPage(page));
	return page;
}

export function deletePage(url: string): void {
	storage.runtimePages.delete(url);
	void storage.pageCache.delete(url);
}
