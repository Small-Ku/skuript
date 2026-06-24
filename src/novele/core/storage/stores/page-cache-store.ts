import type { IndexedDbDriver } from "../drivers/indexed-db";
import type {
	CachedContentRow,
	CachedPageRow,
	CachedUrlRow,
	CachedVersionRow,
	PersistedPageRecord,
} from "../types";

export interface PageCacheStore {
	get(url: string): Promise<PersistedPageRecord | undefined>;
	put(url: string, page: PersistedPageRecord): Promise<void>;
	delete(url: string): Promise<void>;
	clear(): Promise<void>;
}

const URL_STORE_NAME = "urls";
const PAGE_STORE_NAME = "pages";
const CONTENT_STORE_NAME = "contents";
const VERSION_STORE_NAME = "versions";
const PAGE_CACHE_SCHEMA_VERSION = 1;
const PAGE_PARSER_VERSION = "page-raw-html:v1";

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

export class IndexedDbPageCacheStore implements PageCacheStore {
	constructor(private readonly driver: IndexedDbDriver) {}

	/** @mangle-force */
	private async transaction(mode: IDBTransactionMode) {
		const db = await this.driver.open();
		const transaction = db.transaction(
			[URL_STORE_NAME, PAGE_STORE_NAME, CONTENT_STORE_NAME, VERSION_STORE_NAME],
			mode,
		);
		return {
			transaction,
			urls: transaction.objectStore(URL_STORE_NAME),
			pages: transaction.objectStore(PAGE_STORE_NAME),
			contents: transaction.objectStore(CONTENT_STORE_NAME),
			versions: transaction.objectStore(VERSION_STORE_NAME),
		};
	}

	private async getUrlRowByUrl(
		store: IDBObjectStore,
		url: string,
	): Promise<CachedUrlRow | undefined> {
		const index = store.index("byUrl");
		return (await readRequest(index.get(url))) as CachedUrlRow | undefined;
	}

	private async getPageRowByUrlId(
		store: IDBObjectStore,
		urlId: number,
	): Promise<CachedPageRow | undefined> {
		const index = store.index("byUrlId");
		return (await readRequest(index.get(urlId))) as CachedPageRow | undefined;
	}

	private async ensureUrlId(
		store: IDBObjectStore,
		url: string,
	): Promise<number> {
		const existing = await this.getUrlRowByUrl(store, url);
		if (typeof existing?.id === "number") return existing.id;
		return readRequest(
			store.add({
				url,
			} satisfies CachedUrlRow),
		) as Promise<number>;
	}

	private async ensureParserVersionId(store: IDBObjectStore): Promise<number> {
		const index = store.index("byKindValue");
		const existing = (await readRequest(
			index.get(["page-parser", PAGE_PARSER_VERSION]),
		)) as CachedVersionRow | undefined;
		if (typeof existing?.id === "number") return existing.id;
		return readRequest(
			store.add({
				kind: "page-parser",
				value: PAGE_PARSER_VERSION,
			} satisfies CachedVersionRow),
		) as Promise<number>;
	}

	async get(url: string): Promise<PersistedPageRecord | undefined> {
		const { transaction, urls, pages, contents } =
			await this.transaction("readonly");
		const urlRow = await this.getUrlRowByUrl(urls, url);
		if (typeof urlRow?.id !== "number") return;
		const pageRow = await this.getPageRowByUrlId(pages, urlRow.id);
		if (!pageRow) return;
		let raw: string | undefined;
		if (typeof pageRow.rawContentId === "number") {
			const contentRow = (await readRequest(
				contents.get(pageRow.rawContentId),
			)) as CachedContentRow | undefined;
			raw = contentRow?.body;
		}
		await transactionDone(transaction);
		return {
			schemaVersion: pageRow.schemaVersion,
			lastChanged: pageRow.lastChanged,
			title: pageRow.title,
			additionalUrls: pageRow.additionalUrls,
			raw,
			createdAt: pageRow.createdAt,
			updatedAt: pageRow.updatedAt,
			lastAccess: pageRow.lastAccess,
			approxSize: pageRow.approxSize,
		};
	}

	async put(url: string, page: PersistedPageRecord): Promise<void> {
		const { transaction, urls, pages, contents, versions } =
			await this.transaction("readwrite");
		const urlId = await this.ensureUrlId(urls, url);
		const parserVersionId = await this.ensureParserVersionId(versions);
		const existingPage = await this.getPageRowByUrlId(pages, urlId);
		let rawContentId = existingPage?.rawContentId;
		if (page.raw) {
			if (typeof rawContentId === "number") {
				await readRequest(contents.delete(rawContentId));
			}
			rawContentId = (await readRequest(
				contents.add({
					kind: "raw-html",
					body: page.raw,
					size: page.raw.length,
					createdAt: page.createdAt,
					lastAccess: page.lastAccess,
				} satisfies CachedContentRow),
			)) as number;
		}
		const nextPage = {
			urlId,
			rawContentId,
			parserVersionId,
			schemaVersion: PAGE_CACHE_SCHEMA_VERSION,
			lastChanged: page.lastChanged,
			title: page.title,
			additionalUrls: page.additionalUrls,
			createdAt: existingPage?.createdAt ?? page.createdAt,
			updatedAt: page.updatedAt,
			lastAccess: page.lastAccess,
			approxSize: page.approxSize,
		} satisfies CachedPageRow;
		if (typeof existingPage?.id === "number") {
			await readRequest(
				pages.put({
					...nextPage,
					id: existingPage.id,
				} satisfies CachedPageRow),
			);
		} else {
			await readRequest(pages.add(nextPage));
		}
		await transactionDone(transaction);
	}

	async delete(url: string): Promise<void> {
		const { transaction, urls, pages, contents } =
			await this.transaction("readwrite");
		const urlRow = await this.getUrlRowByUrl(urls, url);
		if (typeof urlRow?.id === "number") {
			const pageRow = await this.getPageRowByUrlId(pages, urlRow.id);
			if (typeof pageRow?.rawContentId === "number") {
				await readRequest(contents.delete(pageRow.rawContentId));
			}
			if (typeof pageRow?.id === "number") {
				await readRequest(pages.delete(pageRow.id));
			}
			await readRequest(urls.delete(urlRow.id));
		}
		await transactionDone(transaction);
	}

	async clear(): Promise<void> {
		const { transaction, urls, pages, contents, versions } =
			await this.transaction("readwrite");
		await Promise.all([
			readRequest(urls.clear()),
			readRequest(pages.clear()),
			readRequest(contents.clear()),
			readRequest(versions.clear()),
		]);
		await transactionDone(transaction);
	}
}
