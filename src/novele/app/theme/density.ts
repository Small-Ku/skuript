import type { InterfaceDensity } from "../types";
import { INTERFACE_DENSITY_VALUES } from "../types";

const compactScale = 0.85;
const comfortableScale = 1;
const spaciousScale = 1.15;
const [compactDensity, comfortableDensity, spaciousDensity] =
	INTERFACE_DENSITY_VALUES;

type DensityPreset = Record<InterfaceDensity, number>;

const interfaceDensityPresetScales: DensityPreset = {
	[compactDensity]: compactScale,
	[comfortableDensity]: comfortableScale,
	[spaciousDensity]: spaciousScale,
};

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
		[comfortableDensity, interfaceDensityPresetScales[comfortableDensity]],
	)[0];
}
