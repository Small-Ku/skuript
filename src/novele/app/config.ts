import van, { type State } from "vanjs-core";
import type {
	InterfaceDensity,
	LineSpacingPreset,
	Oklch,
	PanelPosition,
	ReadingWidthPreset,
	TextSizePreset,
	ThemeMode,
	Typeface,
} from "./types";

export type UiPreferences = {
	typeface: Typeface;
	customTypeface: string;
	advancedTextSize: boolean;
	textSizeValue: number;
	textSizePreset: TextSizePreset;
	advancedLineSpacing: boolean;
	lineSpacingValue: number;
	lineSpacingPreset: LineSpacingPreset;
	advancedReadingWidth: boolean;
	readingWidthValue: number;
	readingWidthPreset: ReadingWidthPreset;
	themeMode: ThemeMode;
	lightPrimarySeed: Oklch;
	lightSurfaceSeed: Oklch;
	darkPrimarySeed: Oklch;
	darkSurfaceSeed: Oklch;
	advancedInterfaceDensity: boolean;
	interfaceDensity: InterfaceDensity;
	interfaceScale: number;
	panelPosition: PanelPosition;
	commentAuthor: string;
};

type PreferenceSpec<K extends keyof UiPreferences> = {
	storageKey: string;
	defaultValue: UiPreferences[K];
	parse: (value: unknown) => UiPreferences[K];
	debounceMs?: number;
};

type PreferenceSchema = {
	[K in keyof UiPreferences]: PreferenceSpec<K>;
};

export type PersistedUiState = {
	[K in keyof UiPreferences]: State<UiPreferences[K]>;
};

const typefaceSet = new Set<Typeface>([
	"fontReader",
	"fontUi",
	"fontLiterata",
	"custom",
]);
const textSizePresetSet = new Set<TextSizePreset>(["compact", "regular", "relaxed"]);
const lineSpacingPresetSet = new Set<LineSpacingPreset>([
	"compact",
	"regular",
	"relaxed",
]);
const readingWidthPresetSet = new Set<ReadingWidthPreset>([
	"narrow",
	"regular",
	"wide",
]);
const themeModeSet = new Set<ThemeMode>(["auto", "light", "dark"]);
const interfaceDensitySet = new Set<InterfaceDensity>([
	"compact",
	"comfortable",
	"spacious",
]);
const panelPositionSet = new Set<PanelPosition>(["left", "right"]);

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function parseEnum<T extends string>(value: unknown, values: Set<T>, fallback: T): T {
	return typeof value === "string" && values.has(value as T)
		? (value as T)
		: fallback;
}

function parseString(value: unknown, fallback: string) {
	return typeof value === "string" ? value : fallback;
}

function parseBoolean(value: unknown, fallback: boolean) {
	return typeof value === "boolean" ? value : fallback;
}

function parseNumber(value: unknown, fallback: number, min: number, max: number) {
	return typeof value === "number" && Number.isFinite(value)
		? clamp(value, min, max)
		: fallback;
}

function parseOklch(value: unknown, fallback: Oklch): Oklch {
	if (!value || typeof value !== "object") return fallback;
	const candidate = value as Partial<Oklch>;
	return {
		l: parseNumber(candidate.l, fallback.l, 0, 1),
		c: parseNumber(candidate.c, fallback.c, 0, 1),
		h: parseNumber(candidate.h, fallback.h, 0, 360),
	};
}

const preferenceSchema = {
	typeface: {
		storageKey: "novele:pref:typeface",
		defaultValue: "fontReader" as Typeface,
		parse: (value) => parseEnum(value, typefaceSet, "fontReader" as Typeface),
	},
	customTypeface: {
		storageKey: "novele:pref:customTypeface",
		defaultValue: "Arial",
		parse: (value) => parseString(value, "Arial"),
		debounceMs: 150,
	},
	advancedTextSize: {
		storageKey: "novele:pref:advancedTextSize",
		defaultValue: true,
		parse: (value) => parseBoolean(value, true),
	},
	textSizeValue: {
		storageKey: "novele:pref:textSizeValue",
		defaultValue: 19,
		parse: (value) => parseNumber(value, 19, 14, 28),
		debounceMs: 150,
	},
	textSizePreset: {
		storageKey: "novele:pref:textSizePreset",
		defaultValue: "regular" as TextSizePreset,
		parse: (value) =>
			parseEnum(value, textSizePresetSet, "regular" as TextSizePreset),
	},
	advancedLineSpacing: {
		storageKey: "novele:pref:advancedLineSpacing",
		defaultValue: true,
		parse: (value) => parseBoolean(value, true),
	},
	lineSpacingValue: {
		storageKey: "novele:pref:lineSpacingValue",
		defaultValue: 1.6,
		parse: (value) => parseNumber(value, 1.6, 1.1, 2.5),
		debounceMs: 150,
	},
	lineSpacingPreset: {
		storageKey: "novele:pref:lineSpacingPreset",
		defaultValue: "regular" as LineSpacingPreset,
		parse: (value) =>
			parseEnum(value, lineSpacingPresetSet, "regular" as LineSpacingPreset),
	},
	advancedReadingWidth: {
		storageKey: "novele:pref:advancedReadingWidth",
		defaultValue: true,
		parse: (value) => parseBoolean(value, true),
	},
	readingWidthValue: {
		storageKey: "novele:pref:readingWidthValue",
		defaultValue: 42,
		parse: (value) => parseNumber(value, 42, 30, 60),
		debounceMs: 150,
	},
	readingWidthPreset: {
		storageKey: "novele:pref:readingWidthPreset",
		defaultValue: "regular" as ReadingWidthPreset,
		parse: (value) =>
			parseEnum(value, readingWidthPresetSet, "regular" as ReadingWidthPreset),
	},
	themeMode: {
		storageKey: "novele:pref:themeMode",
		defaultValue: "dark" as ThemeMode,
		parse: (value) => parseEnum(value, themeModeSet, "dark" as ThemeMode),
	},
	lightPrimarySeed: {
		storageKey: "novele:pref:lightPrimarySeed",
		defaultValue: { l: 0.55, c: 0.25, h: 230 },
		parse: (value) => parseOklch(value, { l: 0.55, c: 0.25, h: 230 }),
		debounceMs: 150,
	},
	lightSurfaceSeed: {
		storageKey: "novele:pref:lightSurfaceSeed",
		defaultValue: { l: 0.95, c: 0.02, h: 230 },
		parse: (value) => parseOklch(value, { l: 0.95, c: 0.02, h: 230 }),
		debounceMs: 150,
	},
	darkPrimarySeed: {
		storageKey: "novele:pref:darkPrimarySeed",
		defaultValue: { l: 0.65, c: 0.286, h: 203 },
		parse: (value) => parseOklch(value, { l: 0.65, c: 0.286, h: 203 }),
		debounceMs: 150,
	},
	darkSurfaceSeed: {
		storageKey: "novele:pref:darkSurfaceSeed",
		defaultValue: { l: 0.65, c: 0.337, h: 66 },
		parse: (value) => parseOklch(value, { l: 0.65, c: 0.337, h: 66 }),
		debounceMs: 150,
	},
	advancedInterfaceDensity: {
		storageKey: "novele:pref:advancedInterfaceDensity",
		defaultValue: false,
		parse: (value) => parseBoolean(value, false),
	},
	interfaceDensity: {
		storageKey: "novele:pref:interfaceDensity",
		defaultValue: "comfortable" as InterfaceDensity,
		parse: (value) =>
			parseEnum(value, interfaceDensitySet, "comfortable" as InterfaceDensity),
	},
	interfaceScale: {
		storageKey: "novele:pref:interfaceScale",
		defaultValue: 1,
		parse: (value) => parseNumber(value, 1, 0.75, 1.3),
		debounceMs: 150,
	},
	panelPosition: {
		storageKey: "novele:pref:panelPosition",
		defaultValue: "right" as PanelPosition,
		parse: (value) => parseEnum(value, panelPositionSet, "right" as PanelPosition),
	},
	commentAuthor: {
		storageKey: "novele:pref:commentAuthor",
		defaultValue: "匿名",
		parse: (value) => parseString(value, "匿名"),
		debounceMs: 150,
	},
} satisfies PreferenceSchema;

const preferenceKeys = Object.keys(preferenceSchema) as Array<keyof UiPreferences>;

function getPreferenceSpec<K extends keyof UiPreferences>(key: K): PreferenceSpec<K> {
	return preferenceSchema[key] as PreferenceSpec<K>;
}

function clonePreferenceValue<T>(value: T): T {
	return typeof value === "object" && value !== null
		? structuredClone(value)
		: value;
}

function assignDefaultPreference<K extends keyof UiPreferences>(
	preferences: UiPreferences,
	key: K,
) {
	preferences[key] = clonePreferenceValue(getPreferenceSpec(key).defaultValue);
}

function getDefaultUiPreferences(): UiPreferences {
	const preferences = {} as UiPreferences;
	for (const key of preferenceKeys) {
		assignDefaultPreference(preferences, key);
	}
	return preferences;
}

export const defaultUiPreferences = getDefaultUiPreferences();

function getStorageDefaults() {
	const defaults: Record<string, unknown> = {};
	for (const key of preferenceKeys) {
		const spec = getPreferenceSpec(key);
		defaults[spec.storageKey] = spec.defaultValue;
	}
	return defaults;
}

function assignSanitizedPreference<K extends keyof UiPreferences>(
	preferences: UiPreferences,
	key: K,
	values: Record<string, unknown>,
) {
	const spec = getPreferenceSpec(key);
	preferences[key] = spec.parse(values[spec.storageKey]);
}

function sanitizePreferences(values: Record<string, unknown>): UiPreferences {
	const preferences = {} as UiPreferences;
	for (const key of preferenceKeys) {
		assignSanitizedPreference(preferences, key, values);
	}
	return preferences;
}

export function loadUiPreferences() {
	return sanitizePreferences(GM_getValues(getStorageDefaults()));
}

function bindPreference<K extends keyof UiPreferences>(
	state: State<UiPreferences[K]>,
	spec: PreferenceSpec<K>,
) {
	let lastStoredSerialized = JSON.stringify(state.val);
	let pendingValue: UiPreferences[K] | undefined;
	let saveTimeout: ReturnType<typeof window.setTimeout> | undefined;

	const flushPendingWrite = () => {
		if (pendingValue === undefined) return;
		const nextValue = pendingValue;
		pendingValue = undefined;
		GM_setValue(spec.storageKey, nextValue);
		lastStoredSerialized = JSON.stringify(nextValue);
	};

	const listenerId = GM_addValueChangeListener(
		spec.storageKey,
		(_name, _oldValue, newValue, remote) => {
			if (!remote) return;
			const nextValue = spec.parse(newValue);
			const serialized = JSON.stringify(nextValue);
			if (serialized === lastStoredSerialized) return;
			if (saveTimeout) {
				window.clearTimeout(saveTimeout);
				saveTimeout = undefined;
			}
			pendingValue = undefined;
			lastStoredSerialized = serialized;
			state.val = nextValue;
		},
	);

	van.derive(() => {
		const value = state.val;
		const serialized = JSON.stringify(value);
		if (serialized === lastStoredSerialized) return;
		if (saveTimeout) {
			window.clearTimeout(saveTimeout);
			saveTimeout = undefined;
		}
		if (spec.debounceMs) {
			pendingValue = value;
			saveTimeout = window.setTimeout(() => {
				saveTimeout = undefined;
				flushPendingWrite();
			}, spec.debounceMs);
			return;
		}
		GM_setValue(spec.storageKey, value);
		lastStoredSerialized = serialized;
	});

	const cleanup = () => {
		if (saveTimeout) {
			window.clearTimeout(saveTimeout);
			saveTimeout = undefined;
		}
		flushPendingWrite();
		GM_removeValueChangeListener(listenerId);
	};
	window.addEventListener("beforeunload", cleanup, { once: true });
}

function bindPreferenceKey<K extends keyof UiPreferences>(
	ui: PersistedUiState,
	key: K,
) {
	bindPreference(ui[key], getPreferenceSpec(key));
}

export function bindUiPreferences(ui: PersistedUiState) {
	for (const key of preferenceKeys) {
		bindPreferenceKey(ui, key);
	}
}
