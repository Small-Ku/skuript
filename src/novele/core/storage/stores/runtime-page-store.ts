import type { MemoryMapDriver } from "../drivers/memory-map";

export interface RuntimePageStore<TPage> {
	get(url: string): TPage | undefined;
	set(url: string, page: TPage): void;
	delete(url: string): void;
}

export class RuntimePageStoreImpl<TPage> implements RuntimePageStore<TPage> {
	constructor(private readonly driver: MemoryMapDriver<string, TPage>) {}

	get(url: string): TPage | undefined {
		return this.driver.get(url);
	}

	set(url: string, page: TPage): void {
		this.driver.set(url, page);
	}

	delete(url: string): void {
		this.driver.delete(url);
	}
}
