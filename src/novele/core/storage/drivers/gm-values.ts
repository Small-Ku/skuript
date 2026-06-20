import type { PreferenceChangeHandler } from "../types";

export class GmValuesDriver {
	getValues<T extends Record<string, unknown>>(defaults: T): T {
		return GM_getValues(defaults);
	}

	getValue<T>(key: string, defaultValue: T): T {
		return GM_getValue(key, defaultValue);
	}

	setValue(key: string, value: unknown): void {
		GM_setValue(key, value);
	}

	addChangeListener(key: string, handler: PreferenceChangeHandler): number {
		return GM_addValueChangeListener(key, handler);
	}

	removeChangeListener(listenerId: number): void {
		GM_removeValueChangeListener(listenerId);
	}
}
