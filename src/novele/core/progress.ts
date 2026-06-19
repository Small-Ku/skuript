import { normalizeChapterUrl } from "./scroll";

const CHAPTER_PROGRESS_STORAGE_PREFIX = "novele:chapter-progress:";

/** @mangle-preserve Persisted as JSON in sessionStorage. */
export type ChapterProgressRecord = {
	chapterUrl: string;
	linkIndex: number;
	title?: string;
};

function getChapterProgressStorageKey(pageUrl = window.location.href) {
	return `${CHAPTER_PROGRESS_STORAGE_PREFIX}${normalizeChapterUrl(pageUrl)}`;
}

export function readSessionChapterProgress():
	| ChapterProgressRecord
	| undefined {
	const stored = sessionStorage.getItem(getChapterProgressStorageKey());
	if (!stored) return;
	try {
		const parsed = JSON.parse(stored) as Partial<ChapterProgressRecord>;
		if (
			typeof parsed.chapterUrl !== "string" ||
			typeof parsed.linkIndex !== "number" ||
			Number.isNaN(parsed.linkIndex)
		) {
			return;
		}
		return {
			chapterUrl: normalizeChapterUrl(parsed.chapterUrl),
			linkIndex: Math.max(0, Math.trunc(parsed.linkIndex)),
			title: typeof parsed.title === "string" ? parsed.title : undefined,
		};
	} catch {
		sessionStorage.removeItem(getChapterProgressStorageKey());
		return;
	}
}

export function writeSessionChapterProgress(record: ChapterProgressRecord) {
	sessionStorage.setItem(
		getChapterProgressStorageKey(),
		JSON.stringify({
			chapterUrl: normalizeChapterUrl(record.chapterUrl),
			linkIndex: Math.max(0, Math.trunc(record.linkIndex)),
			title: record.title,
		} satisfies ChapterProgressRecord),
	);
}
