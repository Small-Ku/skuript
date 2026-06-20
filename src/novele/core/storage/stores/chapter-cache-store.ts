import type { IndexedDbDriver } from "../drivers/indexed-db";
import type {
	CachedChapterRow,
	CachedChapterUrlRow,
	CachedContentRow,
	CachedUrlRow,
	PersistedChapterRecord,
} from "../types";

export interface ChapterCacheStore {
	get(url: string): Promise<PersistedChapterRecord | undefined>;
	put(url: string, chapter: PersistedChapterRecord): Promise<void>;
}

const URL_STORE_NAME = "urls";
const CONTENT_STORE_NAME = "contents";
const CHAPTER_STORE_NAME = "chapters";
const CHAPTER_URL_STORE_NAME = "chapter_urls";
const CHAPTER_CACHE_SCHEMA_VERSION = 1;

function readRequest<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => {
			reject(request.error ?? new Error("IndexedDB request failed"));
		};
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () => {
			reject(transaction.error ?? new Error("IndexedDB transaction failed"));
		};
		transaction.onabort = () => {
			reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
		};
	});
}

export class IndexedDbChapterCacheStore implements ChapterCacheStore {
	constructor(private readonly driver: IndexedDbDriver) {}

	private async transaction(mode: IDBTransactionMode) {
		const db = await this.driver.open();
		const transaction = db.transaction(
			[
				URL_STORE_NAME,
				CONTENT_STORE_NAME,
				CHAPTER_STORE_NAME,
				CHAPTER_URL_STORE_NAME,
			],
			mode,
		);
		return {
			transaction,
			urls: transaction.objectStore(URL_STORE_NAME),
			contents: transaction.objectStore(CONTENT_STORE_NAME),
			chapters: transaction.objectStore(CHAPTER_STORE_NAME),
			chapterUrls: transaction.objectStore(CHAPTER_URL_STORE_NAME),
		};
	}

	private async getUrlRowByUrl(store: IDBObjectStore, url: string) {
		const index = store.index("byUrl");
		return (await readRequest(index.get(url))) as CachedUrlRow | undefined;
	}

	private async getUrlRowById(store: IDBObjectStore, id: number) {
		return (await readRequest(store.get(id))) as CachedUrlRow | undefined;
	}

	private async ensureUrlId(store: IDBObjectStore, url: string) {
		const existing = await this.getUrlRowByUrl(store, url);
		if (typeof existing?.id === "number") return existing.id;
		return (await readRequest(
			store.add({
				url,
			} satisfies CachedUrlRow),
		)) as number;
	}

	private async getChapterRowByCacheKey(
		store: IDBObjectStore,
		cacheKey: string,
	) {
		const index = store.index("byCacheKey");
		return (await readRequest(index.get(cacheKey))) as
			| CachedChapterRow
			| undefined;
	}

	async get(url: string): Promise<PersistedChapterRecord | undefined> {
		const { transaction, urls, contents, chapters, chapterUrls } =
			await this.transaction("readonly");
		const urlRow = await this.getUrlRowByUrl(urls, url);
		if (typeof urlRow?.id !== "number") return;
		const chapterUrlIndex = chapterUrls.index("byUrlId");
		const chapterLink = (await readRequest(chapterUrlIndex.get(urlRow.id))) as
			| CachedChapterUrlRow
			| undefined;
		if (!chapterLink) return;
		const chapterRow = (await readRequest(
			chapters.get(chapterLink.chapterId),
		)) as CachedChapterRow | undefined;
		if (!chapterRow) return;
		const contentRow = (await readRequest(
			contents.get(chapterRow.contentId),
		)) as CachedContentRow | undefined;
		if (!contentRow) return;
		const startUrl = (await this.getUrlRowById(urls, chapterRow.startUrlId))
			?.url;
		await transactionDone(transaction);
		const content = JSON.parse(contentRow.body) as Pick<
			PersistedChapterRecord,
			"textLines" | "commentPages"
		>;
		return {
			schemaVersion: CHAPTER_CACHE_SCHEMA_VERSION,
			title: chapterRow.title,
			textLines: content.textLines,
			chapterIndex: chapterRow.chapterIndex,
			startUrl: startUrl ?? url,
			startLinkIndex: chapterRow.startLinkIndex,
			boundaryMode: chapterRow.boundaryMode,
			isComplete: chapterRow.isComplete,
			commentPages: content.commentPages,
			resolvedPageKey: chapterRow.resolvedPageKey,
			resolvedThroughLinkIndex: chapterRow.resolvedThroughLinkIndex,
			lastAccess: chapterRow.lastAccess,
			updatedAt: chapterRow.updatedAt,
		};
	}

	async put(url: string, chapter: PersistedChapterRecord): Promise<void> {
		const { transaction, urls, contents, chapters, chapterUrls } =
			await this.transaction("readwrite");
		const resolvedUrlId = await this.ensureUrlId(urls, url);
		const startUrlId = await this.ensureUrlId(urls, chapter.startUrl);
		const cacheKey = `${startUrlId}:${chapter.resolvedPageKey}:${chapter.resolvedThroughLinkIndex}:${chapter.boundaryMode}`;
		const existingChapter = await this.getChapterRowByCacheKey(
			chapters,
			cacheKey,
		);
		const contentBody = JSON.stringify({
			textLines: chapter.textLines,
			commentPages: chapter.commentPages,
		});
		let contentId = existingChapter?.contentId;
		if (typeof contentId === "number") {
			await readRequest(
				contents.put({
					id: contentId,
					kind: "clean-chapter-v1",
					body: contentBody,
					size: contentBody.length,
					createdAt: chapter.updatedAt,
					lastAccess: chapter.lastAccess,
				} satisfies CachedContentRow),
			);
		} else {
			contentId = (await readRequest(
				contents.add({
					kind: "clean-chapter-v1",
					body: contentBody,
					size: contentBody.length,
					createdAt: chapter.updatedAt,
					lastAccess: chapter.lastAccess,
				} satisfies CachedContentRow),
			)) as number;
		}
		const nextChapter = {
			cacheKey,
			startUrlId,
			contentId,
			title: chapter.title,
			chapterIndex: chapter.chapterIndex,
			startLinkIndex: chapter.startLinkIndex,
			boundaryMode: chapter.boundaryMode,
			isComplete: chapter.isComplete,
			resolvedPageKey: chapter.resolvedPageKey,
			resolvedThroughLinkIndex: chapter.resolvedThroughLinkIndex,
			lastAccess: chapter.lastAccess,
			updatedAt: chapter.updatedAt,
		} satisfies CachedChapterRow;
		let chapterId: number;
		if (typeof existingChapter?.id === "number") {
			chapterId = existingChapter.id;
			await readRequest(
				chapters.put({
					...nextChapter,
					id: existingChapter.id,
				} satisfies CachedChapterRow),
			);
		} else {
			chapterId = (await readRequest(chapters.add(nextChapter))) as number;
		}
		await readRequest(
			chapterUrls.put({
				chapterId,
				urlId: resolvedUrlId,
				role: "resolved",
			} satisfies CachedChapterUrlRow),
		);
		await readRequest(
			chapterUrls.put({
				chapterId,
				urlId: startUrlId,
				role: "start",
			} satisfies CachedChapterUrlRow),
		);
		await transactionDone(transaction);
	}
}
