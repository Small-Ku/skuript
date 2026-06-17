import {
	getTonalRgb,
	relativeLuminance,
	rgbToHex,
	rgbaString,
} from "./color-math";
import type { HueFilter, Oklch, RGB } from "./types";

const hueFilters: HueFilter[] = [
	{
		id: "default",
		start: 320,
		end: 40,
		enabled: true,
		lThreshold: 0.45,
		maxShiftAngle: -20,
		maxChromaShift: -0.02,
	},
	{
		id: "green",
		start: 110,
		end: 170,
		enabled: true,
		lThreshold: 0.85,
		maxShiftAngle: 18,
		maxChromaShift: -0.03,
	},
	{
		id: "yellow",
		start: 40,
		end: 110,
		enabled: true,
		lThreshold: 0.65,
		maxShiftAngle: -24,
		maxChromaShift: -0.16,
	},
	{
		id: "violet",
		start: 260,
		end: 300,
		enabled: true,
		lThreshold: 0.55,
		maxShiftAngle: 8,
		maxChromaShift: -0.01,
	},
];

function withChroma(seed: Oklch, multiplier: number, max = 0.4) {
	return { ...seed, c: Math.min(max, seed.c * multiplier) };
}

function contrastRatio(a: RGB, b: RGB) {
	const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
	const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
	return (lighter + 0.05) / (darker + 0.05);
}

function getReadableOnColor(color: RGB, seed: Oklch, filters: HueFilter[]) {
	const light = getTonalRgb(0.98, withChroma(seed, 0.08), filters);
	const dark = getTonalRgb(0.12, withChroma(seed, 0.12), filters);
	return contrastRatio(color, dark) >= contrastRatio(color, light) ? dark : light;
}

export function generateThemeVars(
	primarySeed: Oklch,
	surfaceSeed: Oklch,
	isDark: boolean,
) {
	const primary = getTonalRgb(
		isDark ? 0.72 : 0.5,
		withChroma(primarySeed, isDark ? 0.82 : 0.9),
		hueFilters,
	);
	const primarySoft = getTonalRgb(
		isDark ? 0.8 : 0.42,
		withChroma(primarySeed, 0.55),
		hueFilters,
	);
	const readerHeading = getTonalRgb(
		isDark ? 0.76 : 0.38,
		withChroma(primarySeed, 0.45),
		hueFilters,
	);
	const onPrimary = getReadableOnColor(primary, surfaceSeed, hueFilters);
	const bg = getTonalRgb(
		isDark ? 0.14 : 0.97,
		withChroma(surfaceSeed, 0.12, 0.016),
		hueFilters,
	);
	const readerBg = getTonalRgb(
		isDark ? 0.115 : 0.985,
		withChroma(surfaceSeed, 0.07, 0.01),
		hueFilters,
	);
	const textMain = getTonalRgb(
		isDark ? 0.93 : 0.16,
		withChroma(surfaceSeed, 0.08, 0.025),
		hueFilters,
	);
	const readerText = getTonalRgb(
		isDark ? 0.84 : 0.26,
		withChroma(surfaceSeed, 0.04, 0.016),
		hueFilters,
	);
	const muted = getTonalRgb(
		isDark ? 0.66 : 0.46,
		withChroma(surfaceSeed, 0.1, 0.035),
		hueFilters,
	);
	const readerMuted = getTonalRgb(
		isDark ? 0.58 : 0.52,
		withChroma(surfaceSeed, 0.06, 0.024),
		hueFilters,
	);
	const borderGlass = getTonalRgb(
		isDark ? 0.82 : 0.22,
		withChroma(surfaceSeed, 0.08, 0.03),
		hueFilters,
	);
	const tint = getTonalRgb(
		isDark ? 0.72 : 0.92,
		withChroma(surfaceSeed, isDark ? 0.3 : 0.18),
		hueFilters,
	);
	const tintStrong = getTonalRgb(
		isDark ? 0.78 : 0.88,
		withChroma(surfaceSeed, isDark ? 0.35 : 0.2),
		hueFilters,
	);
	const fabSurface = getTonalRgb(
		isDark ? 0.18 : 0.96,
		withChroma(surfaceSeed, 0.18),
		hueFilters,
	);
	const panelSolid = getTonalRgb(
		isDark ? 0.16 : 0.98,
		withChroma(surfaceSeed, 0.1),
		hueFilters,
	);

	return {
		"--color-primary": rgbToHex(primary),
		"--color-primary-glow": rgbaString(primary, isDark ? 0.16 : 0.12),
		"--color-on-primary": rgbToHex(onPrimary),
		"--shadow-glow-primary": "0 8px 32px var(--color-primary-glow)",
		"--color-bg": rgbToHex(bg),
		"--color-bg-radiance": rgbaString(primarySoft, isDark ? 0.07 : 0.1),
		"--color-bg-sheen": rgbaString(tintStrong, isDark ? 0.03 : 0.24),
		"--color-reader-bg": rgbToHex(readerBg),
		"--color-surface": rgbaString(tint, isDark ? 0.07 : 0.72),
		"--color-surface-hover": rgbaString(tintStrong, isDark ? 0.13 : 0.92),
		"--color-control-hover": rgbaString(tintStrong, isDark ? 0.12 : 0.74),
		"--color-input-surface": rgbaString(tintStrong, isDark ? 0.09 : 0.68),
		"--color-panel-solid": rgbaString(panelSolid, isDark ? 0.74 : 0.94),
		"--color-fab-surface": rgbaString(fabSurface, isDark ? 0.65 : 0.85),
		"--color-fab-surface-hover": rgbaString(fabSurface, isDark ? 0.8 : 1),
		"--color-border-glass": rgbaString(borderGlass, isDark ? 0.12 : 0.08),
		"--color-text-main": rgbToHex(textMain),
		"--color-reader-text": rgbToHex(readerText),
		"--color-reader-muted": rgbToHex(readerMuted),
		"--color-reader-heading": rgbToHex(readerHeading),
		"--color-muted": rgbToHex(muted),
	};
}
