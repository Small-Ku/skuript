import { writeFile } from "node:fs/promises";
import type { BuildOutput, BunPlugin } from "bun";
import { mangleForcePropertiesSourceTransform } from "./userscript-force-mangle-source-transform";
import { discoverInternalObjectProperties } from "./userscript-internal-property-discovery";
import { buildUserscriptMinifiedBody } from "./userscript-minified-body";

type UserscriptOptimizerPluginOptions = {
	ecma: number;
	scriptName: string;
	headerText: string;
	logger: { info: (message: string) => void; warn: (message: string) => void };
};

/** @see https://bun.sh/docs/bundler/plugins — onEnd is documented but not yet in bun-types. */
type PluginBuilderWithOnEnd = Parameters<NonNullable<BunPlugin["setup"]>>[0] & {
	onEnd(callback: (result: BuildOutput) => void | Promise<void>): void;
};

export { mangleForcePropertiesSourceTransform };

export default function userscriptOptimizer(
	options: UserscriptOptimizerPluginOptions,
): BunPlugin {
	return {
		name: "userscript-optimizer",
		setup(build) {
			// Discovery runs for the Terser mangle regex in onEnd.
			// Start it eagerly so it overlaps with Bun's module graph resolution.
			const discoveryPromise = discoverInternalObjectProperties(
				options.scriptName,
			);

			(build as PluginBuilderWithOnEnd).onEnd(async (result) => {
				if (!result.success) {
					return;
				}

				const internalObjectProperties = await discoveryPromise;

				for (const output of result.outputs) {
					if (output.kind !== "entry-point") {
						continue;
					}

					const source = await output.text();
					const optimizedBody = await buildUserscriptMinifiedBody({
						body: source,
						ecma: options.ecma,
						logger: options.logger,
						internalObjectProperties,
					});
					const optimized = `${options.headerText}${optimizedBody}`;
					await writeFile(output.path, optimized);
					options.logger.info(
						`Optimized userscript ${source.length} chars -> ${optimized.length} chars`,
					);
				}
			});
		},
	};
}
