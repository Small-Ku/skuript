export class LocalStorageDriver {
	getItem(key: string): string | null {
		return localStorage.getItem(key);
	}

	setItem(key: string, value: string): void {
		localStorage.setItem(key, value);
	}

	removeItem(key: string): void {
		localStorage.removeItem(key);
	}

	keys(): string[] {
		const keys: string[] = [];
		for (let index = 0; index < localStorage.length; index += 1) {
			const key = localStorage.key(index);
			if (key) keys.push(key);
		}
		return keys;
	}
}
