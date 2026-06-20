import van, { type State } from "vanjs-core";
import type {
	DrawerHeaderPosition,
	InterfaceDensity,
	LineSpacingPreset,
	Oklch,
	PanelPosition,
	ReadingWidthPreset,
	TextSizePreset,
	ThemeMode,
	Typeface,
} from "../app/types";
import {
	BUILT_IN_TYPEFACE_VALUES,
	COMPACT_REGULAR_RELAXED_VALUES,
	DRAWER_HEADER_POSITION_VALUES,
	INTERFACE_DENSITY_VALUES,
	PANEL_POSITION_VALUES,
	READING_WIDTH_PRESET_VALUES,
	THEME_MODE_VALUES,
} from "../app/types";
import { storage } from "./storage";
import type { PreferenceBlobName } from "./storage/types";

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
	drawerHeaderPosition: DrawerHeaderPosition;
	commentAuthor: string;
};

type PreferenceSpec<K extends keyof UiPreferences> = {
	storageBlob: PreferenceBlobName;
	storageField: string;
	seedValue: UiPreferences[K];
	parse: (value: unknown) => UiPreferences[K];
	debounceMs?: number;
};

type PreferenceSchema = {
	[K in keyof UiPreferences]: PreferenceSpec<K>;
};

export type PersistedUiState = {
	[K in keyof UiPreferences]: State<UiPreferences[K]>;
};

type PreferenceBlobSet = {
	reader: Record<string, unknown>;
	theme: Record<string, unknown>;
	ui: Record<string, unknown>;
	advanced: Record<string, unknown>;
};

const compactRegularRelaxedSet = new Set(COMPACT_REGULAR_RELAXED_VALUES);
const readingWidthPresetSet = new Set<ReadingWidthPreset>(
	READING_WIDTH_PRESET_VALUES,
);
const themeModeSet = new Set<ThemeMode>(THEME_MODE_VALUES);
const interfaceDensitySet = new Set<InterfaceDensity>(INTERFACE_DENSITY_VALUES);
const panelPositionSet = new Set<PanelPosition>(PANEL_POSITION_VALUES);
const drawerHeaderPositionSet = new Set<DrawerHeaderPosition>(
	DRAWER_HEADER_POSITION_VALUES,
);
const regularPreset = COMPACT_REGULAR_RELAXED_VALUES[1];
const regularWidth = READING_WIDTH_PRESET_VALUES[1];
const comfortableDensity = INTERFACE_DENSITY_VALUES[1];

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

function parseEnum<T extends string>(
	value: unknown,
	values: Set<T>,
	fallback: T,
): T {
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

function parseNumber(
	value: unknown,
	fallback: number,
	min: number,
	max: number,
) {
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
		storageBlob: "reader",
		storageField: "typeface",
		seedValue: "fontReader" as Typeface,
		parse: (value) => parseString(value, "fontReader") as Typeface,
	},
	customTypeface: {
		storageBlob: "reader",
		storageField: "customTypeface",
		seedValue: "Arial",
		parse: (value) => parseString(value, "Arial"),
		debounceMs: 150,
	},
	advancedTextSize: {
		storageBlob: "reader",
		storageField: "advancedTextSize",
		seedValue: true,
		parse: (value) => parseBoolean(value, true),
	},
	textSizeValue: {
		storageBlob: "reader",
		storageField: "textSizeValue",
		seedValue: 19,
		parse: (value) => parseNumber(value, 19, 14, 28),
		debounceMs: 150,
	},
	textSizePreset: {
		storageBlob: "reader",
		storageField: "textSizePreset",
		seedValue: regularPreset as TextSizePreset,
		parse: (value) =>
			parseEnum(
				value,
				compactRegularRelaxedSet,
				regularPreset as TextSizePreset,
			),
	},
	advancedLineSpacing: {
		storageBlob: "reader",
		storageField: "advancedLineSpacing",
		seedValue: true,
		parse: (value) => parseBoolean(value, true),
	},
	lineSpacingValue: {
		storageBlob: "reader",
		storageField: "lineSpacingValue",
		seedValue: 1.6,
		parse: (value) => parseNumber(value, 1.6, 1.1, 2.5),
		debounceMs: 150,
	},
	lineSpacingPreset: {
		storageBlob: "reader",
		storageField: "lineSpacingPreset",
		seedValue: regularPreset as LineSpacingPreset,
		parse: (value) =>
			parseEnum(
				value,
				compactRegularRelaxedSet,
				regularPreset as LineSpacingPreset,
			),
	},
	advancedReadingWidth: {
		storageBlob: "reader",
		storageField: "advancedReadingWidth",
		seedValue: true,
		parse: (value) => parseBoolean(value, true),
	},
	readingWidthValue: {
		storageBlob: "reader",
		storageField: "readingWidthValue",
		seedValue: 42,
		parse: (value) => parseNumber(value, 42, 30, 60),
		debounceMs: 150,
	},
	readingWidthPreset: {
		storageBlob: "reader",
		storageField: "readingWidthPreset",
		seedValue: regularWidth as ReadingWidthPreset,
		parse: (value) =>
			parseEnum(
				value,
				readingWidthPresetSet,
				regularWidth as ReadingWidthPreset,
			),
	},
	themeMode: {
		storageBlob: "theme",
		storageField: "themeMode",
		seedValue: "dark" as ThemeMode,
		parse: (value) => parseEnum(value, themeModeSet, "dark" as ThemeMode),
	},
	lightPrimarySeed: {
		storageBlob: "theme",
		storageField: "lightPrimarySeed",
		seedValue: { l: 0.55, c: 0.25, h: 230 },
		parse: (value) => parseOklch(value, { l: 0.55, c: 0.25, h: 230 }),
		debounceMs: 150,
	},
	lightSurfaceSeed: {
		storageBlob: "theme",
		storageField: "lightSurfaceSeed",
		seedValue: { l: 0.95, c: 0.02, h: 230 },
		parse: (value) => parseOklch(value, { l: 0.95, c: 0.02, h: 230 }),
		debounceMs: 150,
	},
	darkPrimarySeed: {
		storageBlob: "theme",
		storageField: "darkPrimarySeed",
		seedValue: { l: 0.65, c: 0.286, h: 203 },
		parse: (value) => parseOklch(value, { l: 0.65, c: 0.286, h: 203 }),
		debounceMs: 150,
	},
	darkSurfaceSeed: {
		storageBlob: "theme",
		storageField: "darkSurfaceSeed",
		seedValue: { l: 0.65, c: 0.337, h: 66 },
		parse: (value) => parseOklch(value, { l: 0.65, c: 0.337, h: 66 }),
		debounceMs: 150,
	},
	advancedInterfaceDensity: {
		storageBlob: "ui",
		storageField: "advancedInterfaceDensity",
		seedValue: false,
		parse: (value) => parseBoolean(value, false),
	},
	interfaceDensity: {
		storageBlob: "ui",
		storageField: "interfaceDensity",
		seedValue: comfortableDensity as InterfaceDensity,
		parse: (value) =>
			parseEnum(
				value,
				interfaceDensitySet,
				comfortableDensity as InterfaceDensity,
			),
	},
	interfaceScale: {
		storageBlob: "ui",
		storageField: "interfaceScale",
		seedValue: 1,
		parse: (value) => parseNumber(value, 1, 0.75, 1.3),
		debounceMs: 150,
	},
	panelPosition: {
		storageBlob: "ui",
		storageField: "panelPosition",
		seedValue: "right" as PanelPosition,
		parse: (value) =>
			parseEnum(value, panelPositionSet, "right" as PanelPosition),
	},
	drawerHeaderPosition: {
		storageBlob: "ui",
		storageField: "drawerHeaderPosition",
		seedValue: "top" as DrawerHeaderPosition,
		parse: (value) =>
			parseEnum(value, drawerHeaderPositionSet, "top" as DrawerHeaderPosition),
	},
	commentAuthor: {
		storageBlob: "advanced",
		storageField: "commentAuthor",
		seedValue: "匿名",
		parse: (value) => parseString(value, "匿名"),
		debounceMs: 150,
	},
} satisfies PreferenceSchema;

const preferenceKeys = Object.keys(preferenceSchema) as Array<
	keyof UiPreferences
>;

function getPreferenceSpec<K extends keyof UiPreferences>(
	key: K,
): PreferenceSpec<K> {
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
	preferences[key] = clonePreferenceValue(getPreferenceSpec(key).seedValue);
}

function getDefaultUiPreferences(): UiPreferences {
	const preferences = {} as UiPreferences;
	for (const key of preferenceKeys) {
		assignDefaultPreference(preferences, key);
	}
	return preferences;
}

export const defaultUiPreferences = getDefaultUiPreferences();

function createPreferenceBlobSet(): PreferenceBlobSet {
	return {
		reader: {} as Record<string, unknown>,
		theme: {} as Record<string, unknown>,
		ui: {} as Record<string, unknown>,
		advanced: {} as Record<string, unknown>,
	};
}

function getPreferenceBlob(
	blobs: PreferenceBlobSet,
	blobName: PreferenceBlobName,
) {
	switch (blobName) {
		case "reader":
			return blobs.reader;
		case "theme":
			return blobs.theme;
		case "ui":
			return blobs.ui;
		case "advanced":
			return blobs.advanced;
	}
}

function getStorageDefaults() {
	const defaults = createPreferenceBlobSet();
	for (const key of preferenceKeys) {
		const spec = getPreferenceSpec(key);
		getPreferenceBlob(defaults, spec.storageBlob)[spec.storageField] =
			clonePreferenceValue(spec.seedValue);
	}
	return defaults;
}

function assignSanitizedPreference<K extends keyof UiPreferences>(
	preferences: UiPreferences,
	key: K,
	values: Record<string, unknown>,
) {
	const spec = getPreferenceSpec(key);
	preferences[key] = spec.parse(values[spec.storageField]);
}

function sanitizePreferences(values: PreferenceBlobSet): UiPreferences {
	const preferences = {} as UiPreferences;
	for (const key of preferenceKeys) {
		assignSanitizedPreference(
			preferences,
			key,
			getPreferenceBlob(values, getPreferenceSpec(key).storageBlob),
		);
	}
	if (preferences.typeface === "custom") {
		preferences.typeface =
			preferences.customTypeface || BUILT_IN_TYPEFACE_VALUES[0];
	}
	return preferences;
}

function loadPreferenceBlobs() {
	const defaults = getStorageDefaults();
	const reader = storage.preferences.loadBlob("reader", defaults.reader);
	const theme = storage.preferences.loadBlob("theme", defaults.theme);
	const ui = storage.preferences.loadBlob("ui", defaults.ui);
	const advanced = storage.preferences.loadBlob("advanced", defaults.advanced);
	return { reader, theme, ui, advanced };
}

export function loadUiPreferences() {
	return sanitizePreferences(loadPreferenceBlobs());
}

function bindPreference<K extends keyof UiPreferences>(
	state: State<UiPreferences[K]>,
	spec: PreferenceSpec<K>,
) {
	let lastStoredSerialized = JSON.stringify(state.val);
	let pendingValue: UiPreferences[K] | undefined;
	let saveTimeout: number | undefined;
	const readBlob = () =>
		getPreferenceBlob(loadPreferenceBlobs(), spec.storageBlob);

	const flushPendingWrite = () => {
		if (pendingValue === undefined) return;
		const nextValue = pendingValue;
		pendingValue = undefined;
		const blob = readBlob();
		blob[spec.storageField] = nextValue;
		storage.preferences.setBlob(spec.storageBlob, blob);
		lastStoredSerialized = JSON.stringify(nextValue);
	};

	const unsubscribe = storage.preferences.subscribe(
		spec.storageBlob,
		(_name, _oldValue, newValue, remote) => {
			if (!remote) return;
			const blob =
				newValue && typeof newValue === "object"
					? (newValue as Record<string, unknown>)
					: {};
			const nextValue = spec.parse(blob[spec.storageField]);
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
		const blob = readBlob();
		blob[spec.storageField] = value;
		storage.preferences.setBlob(spec.storageBlob, blob);
		lastStoredSerialized = serialized;
	});

	const cleanup = () => {
		if (saveTimeout) {
			window.clearTimeout(saveTimeout);
			saveTimeout = undefined;
		}
		flushPendingWrite();
		unsubscribe();
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
