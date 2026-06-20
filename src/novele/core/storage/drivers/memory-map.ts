export class MemoryMapDriver<TKey, TValue> {
	private readonly map = new Map<TKey, TValue>();

	get(key: TKey): TValue | undefined {
		return this.map.get(key);
	}

	set(key: TKey, value: TValue): void {
		this.map.set(key, value);
	}

	delete(key: TKey): void {
		this.map.delete(key);
	}
}
