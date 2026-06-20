import { normalizeChapterUrl } from "./scroll";
import { storage } from "./storage";

/** @mangle-preserve Persisted as JSON in sessionStorage. */
export type ChapterProgressRecord = {
	chapterUrl: string;
	linkIndex: number;
	title?: string;
};

export function readSessionChapterProgress():
	| ChapterProgressRecord
	| undefined {
	return storage.readerSession.readChapterProgress() as
		| ChapterProgressRecord
		| undefined;
}

export function writeSessionChapterProgress(record: ChapterProgressRecord) {
	storage.readerSession.writeChapterProgress({
		...record,
		chapterUrl: normalizeChapterUrl(record.chapterUrl),
		updatedAt: Date.now(),
	});
}
