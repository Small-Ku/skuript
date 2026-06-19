import type { InterfaceDensity } from "../types";

const compactScale = 0.85;
const comfortableScale = 1;
const spaciousScale = 1.15;
const densityUnit = "em";

type DensityPreset = Record<InterfaceDensity, number>;
type DensityValue = number | [number, number];
type DensityTokenDefinition = Record<InterfaceDensity, DensityValue>;

const interfaceDensityPresetScales: DensityPreset = {
	compact: compactScale,
	comfortable: comfortableScale,
	spacious: spaciousScale,
};

const triplet = (
	compact: DensityValue,
	comfortable: DensityValue,
	spacious: DensityValue,
): DensityTokenDefinition => ({ compact, comfortable, spacious });

const dockOffsetTriplet = triplet(0.75, 2, 3);
const fabSizeTriplet = triplet(2.75, 3.5, 4);
const badgeTextTriplet = triplet(0.75, 0.875, 1);
const tabGapTriplet = triplet(1, 1.5, 2);
const settingsPadTriplet = triplet([0.75, 1.25], [1.5, 1.75], [2, 2]);

const densityTokenDefinitions: Record<string, DensityTokenDefinition> = {
	"--ui-top-pad": triplet(0.5, 0.75, 2),
	"--ui-badge-pad": triplet([0.5, 1], [0.75, 1.5], [1, 2]),
	"--ui-badge-txt": badgeTextTriplet,
	"--ui-bot-bot": dockOffsetTriplet,
	"--ui-bot-gap": triplet(0.5, 1, 1.5),
	"--ui-nav-h": fabSizeTriplet,
	"--ui-nav-pad-inline": triplet(1, 1.5, 2),
	"--ui-nav-edge-pad-inline": triplet(0.5, 0.6, 0.9),
	"--ui-nav-gap": triplet(0.875, 0.7, 1.6),
	"--ui-arrow-pad-inline": triplet(0.75, 1, 1.25),
	"--ui-arrow-edge-pad-inline": triplet(0.4, 0.45, 0.6),
	"--ui-arrow-gap": triplet(0.4, 0.45, 0.8),
	"--ui-fab-bot": dockOffsetTriplet,
	"--ui-fab-right": dockOffsetTriplet,
	"--ui-fab-w": fabSizeTriplet,
	"--ui-fab-h": fabSizeTriplet,
	"--ui-draw-head-pad": triplet([0.5, 1], [1, 1.5], [1.5, 2]),
	"--ui-draw-title": triplet(1.125, 1.25, 1.5),
	"--ui-set-body-pad": settingsPadTriplet,
	"--ui-tab-mb": dockOffsetTriplet,
	"--ui-tab-pad": triplet(0.2, 0.35, 0.5),
	"--ui-tab-btn-pad": triplet([0.35, 0], [0.5, 0], [0.75, 0]),
	"--ui-tab-btn-txt": badgeTextTriplet,
	"--ui-tab-gap": tabGapTriplet,
	"--ui-lbl-mb": triplet(0.5, 1, 1.25),
	"--ui-lbl-txt": triplet(0.8125, 0.8125, 0.8125),
	"--ui-btn-row-pad": triplet([0.25, 0.5], [0.375, 0.75], [0.5, 1]),
	"--ui-btn-row-txt": triplet(0.8, 0.875, 1),
	"--ui-slide-head-mb": triplet(0.5, 1, 1.25),
	"--ui-chap-nav-pad": triplet([0.75, 1.25], [1, 1.5], [2, 2]),
	"--ui-chap-nav-gap": triplet(0.25, 0.5, 1),
	"--ui-chap-link-pad": triplet([0.5, 0.75], [1, 1], [1.5, 1.5]),
	"--ui-chap-link-txt": triplet(0.875, 1, 1.125),
	"--ui-comm-pad": settingsPadTriplet,
	"--ui-comm-gap": triplet(0.75, 1.5, 2),
	"--ui-add-comm-pad": settingsPadTriplet,
};

function lerp(a: number, b: number, t: number) {
	return a + (b - a) * t;
}

function getDensitySegment(scale: number) {
	if (scale <= comfortableScale) {
		return {
			startDensity: "compact" as InterfaceDensity,
			endDensity: "comfortable" as InterfaceDensity,
			progress: (scale - compactScale) / (comfortableScale - compactScale),
		};
	}
	return {
		startDensity: "comfortable" as InterfaceDensity,
		endDensity: "spacious" as InterfaceDensity,
		progress: (scale - comfortableScale) / (spaciousScale - comfortableScale),
	};
}

function interpolateValue(
	start: DensityValue,
	end: DensityValue,
	progress: number,
): DensityValue {
	if (!Array.isArray(start) && !Array.isArray(end)) {
		return lerp(start as number, end as number, progress);
	}
	const [startA, startB] = start as [number, number];
	const [endA, endB] = end as [number, number];
	return [lerp(startA, endA, progress), lerp(startB, endB, progress)];
}

function formatValue(value: DensityValue) {
	if (!Array.isArray(value)) {
		return `${Number(value.toFixed(4))}${densityUnit}`;
	}
	return value
		.map((entry) => `${Number(entry.toFixed(4))}${densityUnit}`)
		.join(" ");
}

export function getInterfaceDensityPresetScale(density: InterfaceDensity) {
	return interfaceDensityPresetScales[density];
}

export function getNearestInterfaceDensity(scale: number): InterfaceDensity {
	return (
		Object.entries(interfaceDensityPresetScales) as Array<
			[InterfaceDensity, number]
		>
	).reduce(
		(closest, candidate) =>
			Math.abs(candidate[1] - scale) < Math.abs(closest[1] - scale)
				? candidate
				: closest,
		["comfortable", interfaceDensityPresetScales.comfortable],
	)[0];
}

export function generateDensityVars(scale: number) {
	const { startDensity, endDensity, progress } = getDensitySegment(scale);
	const vars: Record<string, string> = {
		"--ui-nav-pad-block": "0",
		"--ui-arrow-pad-block": "0",
	};

	for (const [token, definition] of Object.entries(densityTokenDefinitions)) {
		const start = definition[startDensity];
		const end = definition[endDensity];
		const value = interpolateValue(start, end, progress);
		vars[token] = formatValue(value);
	}

	vars["--ui-bot-right"] =
		"calc(var(--ui-bot-bot) + var(--ui-fab-w) + var(--ui-bot-gap))";
	vars["--ui-fab-center-x"] =
		"calc(100% - var(--ui-fab-right) - (var(--ui-fab-w) / 2))";
	vars["--ui-fab-center-y"] =
		"calc(100% - var(--ui-fab-bot) - (var(--ui-fab-h) / 2))";

	return vars;
}
