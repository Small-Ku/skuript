import type { SessionStorageDriver } from "../drivers/session-storage";
import { createWriteCoalescer } from "../schedulers/write-coalescer";
import type { PersistedScrollRecord, SessionChapterProgress } from "../types";

export interface ReaderSessionStore {
	readChapterProgress(pageUrl?: string): SessionChapterProgress | undefined;
	writeChapterProgress(record: SessionChapterProgress, pageUrl?: string): void;
	readScrollRatio(chapterUrl: string): number | undefined;
	scheduleScrollRatio(chapterUrl: string, ratio: number): void;
	flush(): void;
}

const SCROLL_STORAGE_PREFIX = "novele:session:scroll:";
const CHAPTER_PROGRESS_STORAGE_PREFIX = "novele:session:progress:";
const MIN_SCROLL_RATIO_DELTA = 0.01;

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function normalizePageUrl(url: string) {
	const parsed = new URL(url);
	parsed.hash = "";
	parsed.pathname = parsed.pathname.replace(/\/comment-page-\d+\/?$/, "");
	return parsed.href;
}

function getChapterProgressStorageKey(pageUrl = window.location.href) {
	return `${CHAPTER_PROGRESS_STORAGE_PREFIX}${normalizePageUrl(pageUrl)}`;
}

function getScrollStorageKey(chapterUrl: string) {
	return `${SCROLL_STORAGE_PREFIX}${normalizePageUrl(chapterUrl)}`;
}

export class ReaderSessionStoreImpl implements ReaderSessionStore {
	private lastProgressPayload = "";
	private readonly scrollRatios = new Map<string, number>();
	private readonly scrollWriter = createWriteCoalescer<string, number>({
		flushDelayMs: 200,
		onFlush: (entries) => {
			for (const [url, ratio] of entries) {
				this.driver.setItem(
					getScrollStorageKey(url),
					JSON.stringify({
						ratio: clamp(ratio, 0, 1),
						updatedAt: Date.now(),
					} satisfies PersistedScrollRecord),
				);
				this.scrollRatios.set(url, clamp(ratio, 0, 1));
			}
		},
	});

	constructor(private readonly driver: SessionStorageDriver) {}

	readChapterProgress(pageUrl = window.location.href) {
		const stored = this.driver.getItem(getChapterProgressStorageKey(pageUrl));
		if (!stored) return;
		try {
			const parsed = JSON.parse(stored) as Partial<SessionChapterProgress>;
			if (
				typeof parsed.chapterUrl !== "string" ||
				typeof parsed.linkIndex !== "number" ||
				Number.isNaN(parsed.linkIndex)
			) {
				return;
			}
			return {
				chapterUrl: normalizePageUrl(parsed.chapterUrl),
				linkIndex: Math.max(0, Math.trunc(parsed.linkIndex)),
				title: typeof parsed.title === "string" ? parsed.title : undefined,
				updatedAt:
					typeof parsed.updatedAt === "number" &&
					Number.isFinite(parsed.updatedAt)
						? parsed.updatedAt
						: 0,
			} satisfies SessionChapterProgress;
		} catch {
			this.driver.removeItem(getChapterProgressStorageKey(pageUrl));
			return;
		}
	}

	writeChapterProgress(
		record: SessionChapterProgress,
		pageUrl = window.location.href,
	) {
		const payload = JSON.stringify({
			chapterUrl: normalizePageUrl(record.chapterUrl),
			linkIndex: Math.max(0, Math.trunc(record.linkIndex)),
			title: record.title,
			updatedAt:
				typeof record.updatedAt === "number" &&
				Number.isFinite(record.updatedAt)
					? record.updatedAt
					: Date.now(),
		} satisfies SessionChapterProgress);
		if (payload === this.lastProgressPayload) return;
		this.lastProgressPayload = payload;
		this.driver.setItem(getChapterProgressStorageKey(pageUrl), payload);
	}

	readScrollRatio(chapterUrl: string) {
		const stored = this.driver.getItem(getScrollStorageKey(chapterUrl));
		if (!stored) return;
		try {
			const parsed = JSON.parse(stored) as Partial<PersistedScrollRecord>;
			if (typeof parsed.ratio !== "number" || Number.isNaN(parsed.ratio))
				return;
			const ratio = clamp(parsed.ratio, 0, 1);
			this.scrollRatios.set(chapterUrl, ratio);
			return ratio;
		} catch {
			this.driver.removeItem(getScrollStorageKey(chapterUrl));
			return;
		}
	}

	scheduleScrollRatio(chapterUrl: string, ratio: number) {
		const nextRatio = clamp(ratio, 0, 1);
		const previousRatio = this.scrollRatios.get(chapterUrl);
		if (
			previousRatio !== undefined &&
			Math.abs(previousRatio - nextRatio) < MIN_SCROLL_RATIO_DELTA
		) {
			return;
		}
		this.scrollWriter.set(chapterUrl, nextRatio);
	}

	flush() {
		this.scrollWriter.flush();
	}
}

export { normalizePageUrl };
