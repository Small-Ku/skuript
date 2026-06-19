import { readFile } from "node:fs/promises";
import type { BunPlugin } from "bun";

export type TypeScriptSourceTransform = {
	name: string;
	transform: (args: {
		path: string;
		source: string;
	}) => string | Promise<string>;
};

type TypeScriptSourceTransformPluginOptions = {
	transforms: TypeScriptSourceTransform[];
};

export default function typeScriptSourceTransform(
	options: TypeScriptSourceTransformPluginOptions,
): BunPlugin {
	return {
		name: "typescript-source-transform",
		setup(build) {
			build.onLoad({ filter: /\.[cm]?tsx?$/ }, async (args) => {
				let source = await readFile(args.path, "utf8");

				for (const transform of options.transforms) {
					source = await transform.transform({
						path: args.path,
						source,
					});
				}

				return {
					contents: source,
					loader: args.path.endsWith("x") ? "tsx" : "ts",
				};
			});
		},
	};
}
