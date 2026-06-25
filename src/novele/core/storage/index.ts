import { GmValuesDriver } from "./drivers/gm-values";
import { IndexedDbDriver } from "./drivers/indexed-db";
import { LocalStorageDriver } from "./drivers/local-storage";
import { MemoryMapDriver } from "./drivers/memory-map";
import {
	type ChapterCacheStore,
	IndexedDbChapterCacheStore,
} from "./stores/chapter-cache-store";
import {
	type CommentCacheStore,
	CommentCacheStoreImpl,
} from "./stores/comment-cache-store";
import {
	IndexedDbPageCacheStore,
	type PageCacheStore,
} from "./stores/page-cache-store";
import {
	type PreferencesStore,
	PreferencesStoreImpl,
} from "./stores/preferences-store";
import {
	type ReaderSessionStore,
	ReaderSessionStoreImpl,
} from "./stores/reader-session-store";
import {
	type RuntimePageStore,
	RuntimePageStoreImpl,
} from "./stores/runtime-page-store";
import type { PersistedChapterRecord, PersistedPageRecord } from "./types";

export interface NoveleStorage {
	preferences: PreferencesStore;
	readerSession: ReaderSessionStore;
	pageCache: PageCacheStore;
	chapterCache: ChapterCacheStore;
	runtimePages: RuntimePageStore<unknown>;
	comments: CommentCacheStore<unknown>;
}

// @test-only
class MemoryPreferencesDriver {
	private readonly map = new Map<string, unknown>();
	private listenerId = 0;
	// biome-ignore lint/suspicious/noExplicitAny: test environment mock
	private readonly listeners = new Map<number, { key: string; handler: any }>();

	getValue<T>(key: string, defaultValue: T): T {
		return (this.map.has(key) ? this.map.get(key) : defaultValue) as T;
	}

	setValue(key: string, value: unknown): void {
		const oldValue = this.map.get(key);
		this.map.set(key, value);
		for (const listener of this.listeners.values()) {
			if (listener.key === key) {
				listener.handler(key, oldValue, value, false);
			}
		}
	}

	// biome-ignore lint/suspicious/noExplicitAny: test environment mock
	addChangeListener(key: string, handler: any): number {
		const id = ++this.listenerId;
		this.listeners.set(id, { key, handler });
		return id;
	}

	removeChangeListener(listenerId: number): void {
		this.listeners.delete(listenerId);
	}
}

// @test-only
class MemoryPageCacheStore implements PageCacheStore {
	private readonly cache = new Map<string, PersistedPageRecord>();
	async get(url: string) {
		return this.cache.get(url);
	}
	async put(url: string, page: PersistedPageRecord) {
		this.cache.set(url, page);
	}
	async delete(url: string) {
		this.cache.delete(url);
	}
	async clear() {
		this.cache.clear();
	}
}

// @test-only
class MemoryChapterCacheStore implements ChapterCacheStore {
	private readonly cache = new Map<string, PersistedChapterRecord>();
	async get(url: string) {
		return this.cache.get(url);
	}
	async put(url: string, chapter: PersistedChapterRecord) {
		this.cache.set(url, chapter);
	}
}

export function createNoveleStorage(): NoveleStorage {
	// @test-only
	if (process.env.NODE_ENV === "test") {
		return {
			preferences: new PreferencesStoreImpl(
				new MemoryPreferencesDriver() as unknown as GmValuesDriver,
			),
			readerSession: new ReaderSessionStoreImpl(new LocalStorageDriver()),
			pageCache: new MemoryPageCacheStore(),
			chapterCache: new MemoryChapterCacheStore(),
			runtimePages: new RuntimePageStoreImpl(new MemoryMapDriver()),
			comments: new CommentCacheStoreImpl(new MemoryMapDriver()),
		};
	}

	const localDriver = new LocalStorageDriver();
	const pageCacheDriver = new IndexedDbDriver(
		"novele-cache-v1",
		1,
		(db, _transaction, oldVersion) => {
			if (oldVersion < 1) {
				const urls = db.createObjectStore("urls", {
					keyPath: "id",
					autoIncrement: true,
				});
				urls.createIndex("byUrl", "url", { unique: true });
				const contents = db.createObjectStore("contents", {
					keyPath: "id",
					autoIncrement: true,
				});
				contents.createIndex("byLastAccess", "lastAccess");
				const pages = db.createObjectStore("pages", {
					keyPath: "id",
					autoIncrement: true,
				});
				pages.createIndex("byUrlId", "urlId", { unique: true });
				pages.createIndex("byLastAccess", "lastAccess");
				pages.createIndex("byUpdatedAt", "updatedAt");
				const versions = db.createObjectStore("versions", {
					keyPath: "id",
					autoIncrement: true,
				});
				versions.createIndex("byKindValue", ["kind", "value"], {
					unique: true,
				});
				const chapters = db.createObjectStore("chapters", {
					keyPath: "id",
					autoIncrement: true,
				});
				chapters.createIndex("byCacheKey", "cacheKey", { unique: true });
				chapters.createIndex("byLastAccess", "lastAccess");
				const chapterUrls = db.createObjectStore("chapter_urls", {
					keyPath: ["chapterId", "urlId"],
				});
				chapterUrls.createIndex("byUrlId", "urlId");
			}
		},
	);
	const storage = {
		preferences: new PreferencesStoreImpl(new GmValuesDriver()),
		readerSession: new ReaderSessionStoreImpl(localDriver),
		pageCache: new IndexedDbPageCacheStore(pageCacheDriver),
		chapterCache: new IndexedDbChapterCacheStore(pageCacheDriver),
		runtimePages: new RuntimePageStoreImpl(new MemoryMapDriver()),
		comments: new CommentCacheStoreImpl(new MemoryMapDriver()),
	} satisfies NoveleStorage;

	// @test-not
	const flushReaderSession = () => {
		storage.readerSession.flush();
	};
	// @test-not
	window.addEventListener("pagehide", flushReaderSession);
	// @test-not
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") {
			flushReaderSession();
		}
	});

	return storage;
}

export const storage = createNoveleStorage();
