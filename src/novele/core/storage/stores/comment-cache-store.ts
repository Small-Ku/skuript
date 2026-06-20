import type { MemoryMapDriver } from "../drivers/memory-map";

export interface CommentCacheStore<TCommentPage> {
	get(url: string): TCommentPage | undefined;
	set(url: string, page: TCommentPage): void;
}

export class CommentCacheStoreImpl<TCommentPage>
	implements CommentCacheStore<TCommentPage>
{
	constructor(private readonly driver: MemoryMapDriver<string, TCommentPage>) {}

	get(url: string): TCommentPage | undefined {
		return this.driver.get(url);
	}

	set(url: string, page: TCommentPage): void {
		this.driver.set(url, page);
	}
}
