const SCROLL_STORAGE_PREFIX = "novele:chapter-scroll:";

/** @mangle-preserve Persisted as JSON in sessionStorage. */
export type ScrollRecord = {
	ratio: number;
};

export function normalizeChapterUrl(url: string) {
	const parsed = new URL(url);
	parsed.hash = "";
	parsed.pathname = parsed.pathname.replace(/\/comment-page-\d+\/?$/, "");
	return parsed.href;
}

function getScrollStorageKey(chapterUrl: string) {
	return `${SCROLL_STORAGE_PREFIX}${normalizeChapterUrl(chapterUrl)}`;
}

export function readChapterScrollRecord(
	chapterUrl: string,
): ScrollRecord | undefined {
	const stored = sessionStorage.getItem(getScrollStorageKey(chapterUrl));
	if (!stored) return;
	try {
		const parsed = JSON.parse(stored) as Partial<ScrollRecord>;
		if (typeof parsed.ratio !== "number" || Number.isNaN(parsed.ratio)) return;
		return {
			ratio: Math.max(0, Math.min(1, parsed.ratio)),
		};
	} catch {
		sessionStorage.removeItem(getScrollStorageKey(chapterUrl));
		return;
	}
}

export function writeChapterScrollRecord(chapterUrl: string, ratio: number) {
	sessionStorage.setItem(
		getScrollStorageKey(chapterUrl),
		JSON.stringify({
			ratio: Math.max(0, Math.min(1, ratio)),
		} satisfies ScrollRecord),
	);
}
