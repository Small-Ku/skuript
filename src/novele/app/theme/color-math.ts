import type { HueFilter, Oklch, RGB } from "../types";

function srgbToLinear(value: number) {
	return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number) {
	return value <= 0.0031308
		? value * 12.92
		: 1.055 * value ** (1 / 2.4) - 0.055;
}

export function rgbToHex(rgb: RGB) {
	const toHex = (value: number) =>
		Math.max(0, Math.min(255, Math.round(value * 255)))
			.toString(16)
			.padStart(2, "0");
	return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
}

export function oklchToRgb(oklch: Oklch): RGB {
	const a = oklch.c * Math.cos((oklch.h * Math.PI) / 180);
	const b = oklch.c * Math.sin((oklch.h * Math.PI) / 180);
	const lPrime = oklch.l + 0.3963377774 * a + 0.2158037573 * b;
	const mPrime = oklch.l - 0.1055613458 * a - 0.0638541728 * b;
	const sPrime = oklch.l - 0.0894841775 * a - 1.291485548 * b;
	const l = lPrime * lPrime * lPrime;
	const m = mPrime * mPrime * mPrime;
	const s = sPrime * sPrime * sPrime;
	const rLinear = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
	const gLinear = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
	const bLinear = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
	return {
		r: linearToSrgb(rLinear),
		g: linearToSrgb(gLinear),
		b: linearToSrgb(bLinear),
	};
}

function getMatchingHueFilter(hue: number, filters: HueFilter[]) {
	const activeFilters = filters.filter((filter) => filter.enabled);
	const normalizedHue = ((hue % 360) + 360) % 360;
	for (const filter of activeFilters) {
		const start = ((filter.start % 360) + 360) % 360;
		const end = ((filter.end % 360) + 360) % 360;
		if (start <= end) {
			if (normalizedHue >= start && normalizedHue <= end) return filter;
			continue;
		}
		if (normalizedHue >= start || normalizedHue <= end) return filter;
	}
	return null;
}

function applyHueShift(
	hue: number,
	targetLightness: number,
	thresholdLightness: number,
	maxShiftAngle: number,
) {
	const shift =
		targetLightness < thresholdLightness
			? maxShiftAngle * (1 - targetLightness / thresholdLightness)
			: 0;
	const shifted = (hue + shift) % 360;
	return shifted < 0 ? shifted + 360 : shifted;
}

function applyChromaShift(
	chroma: number,
	targetLightness: number,
	thresholdLightness: number,
	maxChromaShift: number,
) {
	const shift =
		targetLightness < thresholdLightness
			? maxChromaShift * (1 - targetLightness / thresholdLightness)
			: 0;
	return Math.max(0, chroma + shift);
}

function gamutMapOklch(lightness: number, chroma: number, hue: number) {
	if (lightness <= 0) {
		return { rgb: { r: 0, g: 0, b: 0 }, safeChroma: 0 };
	}
	if (lightness >= 1) {
		return { rgb: { r: 1, g: 1, b: 1 }, safeChroma: 0 };
	}
	let low = 0;
	let high = chroma;
	const tolerance = 0.0001;
	for (let index = 0; index < 15; index += 1) {
		const mid = (low + high) / 2;
		const rgb = oklchToRgb({ l: lightness, c: mid, h: hue });
		const inside =
			rgb.r >= -tolerance &&
			rgb.r <= 1 + tolerance &&
			rgb.g >= -tolerance &&
			rgb.g <= 1 + tolerance &&
			rgb.b >= -tolerance &&
			rgb.b <= 1 + tolerance;
		if (inside) {
			low = mid;
		} else {
			high = mid;
		}
	}
	const rgb = oklchToRgb({ l: lightness, c: low, h: hue });
	return {
		safeChroma: low,
		rgb: {
			r: Math.max(0, Math.min(1, rgb.r)),
			g: Math.max(0, Math.min(1, rgb.g)),
			b: Math.max(0, Math.min(1, rgb.b)),
		},
	};
}

export function getMaxChroma(lightness: number, hue: number, upperBound = 0.5) {
	return gamutMapOklch(lightness, upperBound, hue).safeChroma;
}

export function getTonalRgb(
	targetLightness: number,
	seed: Oklch,
	filters: HueFilter[],
) {
	const filter = getMatchingHueFilter(seed.h, filters);
	const hue = filter
		? applyHueShift(
				seed.h,
				targetLightness,
				filter.lThreshold,
				filter.maxShiftAngle,
			)
		: seed.h;
	const chroma = filter
		? applyChromaShift(
				seed.c,
				targetLightness,
				filter.lThreshold,
				filter.maxChromaShift,
			)
		: seed.c;
	return gamutMapOklch(targetLightness, chroma, hue).rgb;
}

export function rgbaString(rgb: RGB, alpha: number) {
	return `rgba(${Math.round(rgb.r * 255)}, ${Math.round(rgb.g * 255)}, ${Math.round(rgb.b * 255)}, ${alpha})`;
}

export function relativeLuminance(rgb: RGB) {
	const r = srgbToLinear(Math.max(0, Math.min(1, rgb.r)));
	const g = srgbToLinear(Math.max(0, Math.min(1, rgb.g)));
	const b = srgbToLinear(Math.max(0, Math.min(1, rgb.b)));
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
