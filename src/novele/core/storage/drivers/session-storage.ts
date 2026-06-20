export class SessionStorageDriver {
	getItem(key: string): string | null {
		return sessionStorage.getItem(key);
	}

	setItem(key: string, value: string): void {
		sessionStorage.setItem(key, value);
	}

	removeItem(key: string): void {
		sessionStorage.removeItem(key);
	}

	keys(): string[] {
		const keys: string[] = [];
		for (let index = 0; index < sessionStorage.length; index += 1) {
			const key = sessionStorage.key(index);
			if (key) keys.push(key);
		}
		return keys;
	}
}
