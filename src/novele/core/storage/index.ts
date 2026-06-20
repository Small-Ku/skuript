import { GmValuesDriver } from "./drivers/gm-values";
import { IndexedDbDriver } from "./drivers/indexed-db";
import { MemoryMapDriver } from "./drivers/memory-map";
import { SessionStorageDriver } from "./drivers/session-storage";
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

export interface NoveleStorage {
	preferences: PreferencesStore;
	readerSession: ReaderSessionStore;
	pageCache: PageCacheStore;
	chapterCache: ChapterCacheStore;
	runtimePages: RuntimePageStore<unknown>;
	comments: CommentCacheStore<unknown>;
}

export function createNoveleStorage(): NoveleStorage {
	const sessionDriver = new SessionStorageDriver();
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
		readerSession: new ReaderSessionStoreImpl(sessionDriver),
		pageCache: new IndexedDbPageCacheStore(pageCacheDriver),
		chapterCache: new IndexedDbChapterCacheStore(pageCacheDriver),
		runtimePages: new RuntimePageStoreImpl(new MemoryMapDriver()),
		comments: new CommentCacheStoreImpl(new MemoryMapDriver()),
	} satisfies NoveleStorage;

	const flushReaderSession = () => {
		storage.readerSession.flush();
	};
	window.addEventListener("pagehide", flushReaderSession);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") {
			flushReaderSession();
		}
	});

	return storage;
}

export const storage = createNoveleStorage();
