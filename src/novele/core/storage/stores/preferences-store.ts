import type { GmValuesDriver } from "../drivers/gm-values";
import type { PreferenceBlobName } from "../types";

export interface PreferencesStore {
	loadBlob<T extends Record<string, unknown>>(
		blob: PreferenceBlobName,
		defaults: T,
	): T;
	setBlob(blob: PreferenceBlobName, value: Record<string, unknown>): void;
	subscribe(
		blob: PreferenceBlobName,
		handler: (
			key: PreferenceBlobName,
			oldValue: unknown,
			newValue: unknown,
			remote: boolean,
		) => void,
	): () => void;
}

export class PreferencesStoreImpl implements PreferencesStore {
	constructor(private readonly driver: GmValuesDriver) {}

	private getStorageKey(blob: PreferenceBlobName) {
		return `novele:pref:${blob}`;
	}

	private cloneRecord<T extends Record<string, unknown>>(value: T): T {
		return structuredClone(value);
	}

	loadBlob<T extends Record<string, unknown>>(
		blob: PreferenceBlobName,
		defaults: T,
	): T {
		const fallback = this.cloneRecord(defaults);
		const stored = this.driver.getValue(this.getStorageKey(blob), fallback);
		if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
			return fallback;
		}
		return {
			...fallback,
			...(stored as Record<string, unknown>),
		} as T;
	}

	setBlob(blob: PreferenceBlobName, value: Record<string, unknown>): void {
		this.driver.setValue(this.getStorageKey(blob), value);
	}

	subscribe(
		blob: PreferenceBlobName,
		handler: (
			key: PreferenceBlobName,
			oldValue: unknown,
			newValue: unknown,
			remote: boolean,
		) => void,
	): () => void {
		const listenerId = this.driver.addChangeListener(
			this.getStorageKey(blob),
			(_key, oldValue, newValue, remote) => {
				handler(blob, oldValue, newValue, remote);
			},
		);
		return () => {
			this.driver.removeChangeListener(listenerId);
		};
	}
}
