import { storage } from "./storage";

/** @mangle-preserve Persisted as JSON in localStorage. */
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
	return normalizeChapterUrl(chapterUrl);
}

export function readChapterScrollRecord(
	chapterUrl: string,
): ScrollRecord | undefined {
	const ratio = storage.readerSession.readScrollRatio(
		getScrollStorageKey(chapterUrl),
	);
	return ratio === undefined ? undefined : { ratio };
}

export function writeChapterScrollRecord(chapterUrl: string, ratio: number) {
	storage.readerSession.scheduleScrollRatio(
		getScrollStorageKey(chapterUrl),
		ratio,
	);
}
