/** @mangle-preserve Persisted as JSON in sessionStorage. */
export type SessionChapterProgress = {
	chapterUrl: string;
	linkIndex: number;
	title?: string;
	updatedAt: number;
};

/** @mangle-preserve Persisted as JSON in sessionStorage. */
export type PersistedScrollRecord = {
	ratio: number;
	updatedAt: number;
};

/** @mangle-preserve Persisted in IndexedDB page cache. */
export type PersistedPageRecord = {
	schemaVersion: number;
	lastChanged: string;
	title: string[];
	additionalUrls?: string[];
	raw?: string;
	createdAt: number;
	updatedAt: number;
	lastAccess: number;
	approxSize: number;
};

export type PreferenceBlobName = "reader" | "theme" | "ui" | "advanced";

/** @mangle-preserve Persisted in IndexedDB. */
export type CachedUrlRow = {
	id?: number;
	url: string;
};

/** @mangle-preserve Persisted in IndexedDB. */
export type CachedContentRow = {
	id?: number;
	kind: "raw-html" | "clean-chapter-v1";
	body: string;
	size: number;
	createdAt: number;
	lastAccess: number;
};

/** @mangle-preserve Persisted in IndexedDB. */
export type CachedPageRow = {
	id?: number;
	urlId: number;
	rawContentId?: number;
	parserVersionId: number;
	schemaVersion: number;
	lastChanged: string;
	title: string[];
	additionalUrls?: string[];
	createdAt: number;
	updatedAt: number;
	lastAccess: number;
	approxSize: number;
};

/** @mangle-preserve Persisted in IndexedDB. */
export type CachedVersionRow = {
	id?: number;
	kind: "page-parser";
	value: string;
};

/** @mangle-preserve Persisted in IndexedDB chapter content. */
export type PersistedCommentPageRef = {
	url: string;
	scope: "catalog" | "chapter" | "page";
	pageNumber: number;
	ownerUrl?: string;
};

/** @mangle-preserve Persisted in IndexedDB chapter cache. */
export type PersistedChapterRecord = {
	schemaVersion: number;
	title?: string;
	textLines: string[];
	chapterIndex?: number;
	startUrl: string;
	startLinkIndex: number;
	boundaryMode: "marker-bounded" | "link-bounded";
	isComplete: boolean;
	commentPages: PersistedCommentPageRef[];
	resolvedPageKey: string;
	resolvedThroughLinkIndex: number;
	lastAccess: number;
	updatedAt: number;
};

/** @mangle-preserve Persisted in IndexedDB. */
export type CachedChapterRow = {
	id?: number;
	cacheKey: string;
	startUrlId: number;
	contentId: number;
	title?: string;
	chapterIndex?: number;
	startLinkIndex: number;
	boundaryMode: "marker-bounded" | "link-bounded";
	isComplete: boolean;
	resolvedPageKey: string;
	resolvedThroughLinkIndex: number;
	lastAccess: number;
	updatedAt: number;
};

/** @mangle-preserve Persisted in IndexedDB. */
export type CachedChapterUrlRow = {
	chapterId: number;
	urlId: number;
	role: "resolved" | "start";
};

export type PreferenceChangeHandler = (
	key: string,
	oldValue: unknown,
	newValue: unknown,
	remote: boolean,
) => void;
