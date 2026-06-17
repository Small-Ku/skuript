// Ported from https://github.com/taggon/bun-style-loader

import type { BunPlugin, OnLoadResult } from "bun";
import {
	browserslistToTargets,
	Features,
	transform,
	type CSSModulesConfig,
} from "lightningcss-wasm";
import * as sass from "sass";
import fs from "node:fs";

/**
 * No options for now
 */
export type StyleLoaderOptions = {
	/**
	 * List of target browsers to support
	 * @example ['chrome 80', 'ie 11']
	 */
	targets?: string[];
	cssModules?: boolean | CSSModulesConfig;
};

const defaultOptions: StyleLoaderOptions = {
	targets: [],
	cssModules: false,
};

export default function styleLoader(
	options: StyleLoaderOptions = {},
): BunPlugin {
	const opts = { ...defaultOptions, ...options };

	return {
		name: "style-loader",
		async setup(build) {
			build.onLoad({ filter: /\.s?css$/ }, (args) => {
				const fileName = args.path.split("/").pop()?.split(".");
				const isScss = fileName?.pop() === "scss";
				const isCssModule = fileName?.pop() === "module";

				const contents = isScss
					? sass.compile(args.path).css
					: fs.readFileSync(args.path, "utf8");

				return compileCSS(contents, args.path, {
					cssModules: isCssModule ? opts.cssModules : false,
					targets: opts.targets,
				});
			});
		},
	};
}

type CompileOptions = {
	cssModules?: boolean | CSSModulesConfig;
	targets?: string[];
};

function restoreBackdropFilterFallback(css: string): string {
	return css.replace(
		/-webkit-backdrop-filter:\s*([^;]+);/g,
		(match, value, offset, source) => {
			const tail = source.slice(offset + match.length, offset + match.length + 80);
			if (tail.includes("backdrop-filter")) return match;
			return `-webkit-backdrop-filter:${value};backdrop-filter:${value};`;
		},
	);
}

async function compileCSS(
	content: string,
	path: string,
	options: CompileOptions = {},
): Promise<OnLoadResult> {
	const imports: string[] = [];
	const targets = options.targets?.length
		? browserslistToTargets(options.targets)
		: undefined;
	const { code, exports } = transform({
		filename: path,
		code: new Uint8Array(Buffer.from(content)),
		cssModules: options.cssModules,
		minify: true,
		include: Features.VendorPrefixes,
		targets,
		visitor: {
			Rule: {
				import(rule) {
					imports.push(rule.value.url);
					return [];
				},
			},
		},
	});

	const cssText = restoreBackdropFilterFallback(code.toString());

	if (options.cssModules) {
		const nameMap = Object.fromEntries(
			Object.entries(exports || {}).map(([key, item]) => [key, item.name]),
		);
		return {
			contents: `export const code = ${JSON.stringify(cssText)};\nexport default ${JSON.stringify(nameMap)};`,
			loader: "js",
		};
	}

	if (imports.length === 0) {
		return {
			contents: `export default ${JSON.stringify(cssText)};`,
			loader: "js",
		};
	}

	const imported = imports
		.map((url, i) => `import _css${i} from "${url}";`)
		.join("\n");
	const exported = imports.map((_, i) => `_css${i}`).join(" + ");

	return {
		contents: `${imported}\nexport default ${exported} + ${JSON.stringify(cssText)};`,
		loader: "js",
	};
}
