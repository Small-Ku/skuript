// Ported from https://github.com/taggon/bun-style-loader

import fs from "node:fs";
import type { BunPlugin, OnLoadResult } from "bun";
import {
	browserslistToTargets,
	type CSSModulesConfig,
	Features,
	transform,
} from "lightningcss-wasm";
import * as sass from "sass";

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

function getStyleFileInfo(filePath: string) {
	const fileNameParts = filePath.split("/").pop()?.split(".") ?? [];
	const extension = fileNameParts.at(-1);
	const moduleMarker = fileNameParts.at(-2);
	return {
		isScss: extension === "scss",
		isCssModule:
			(extension === "css" || extension === "scss") &&
			moduleMarker === "module",
	};
}

function loadStyleFile(filePath: string) {
	const info = getStyleFileInfo(filePath);
	return {
		...info,
		contents: info.isScss
			? sass.compile(filePath).css
			: fs.readFileSync(filePath, "utf8"),
	};
}

const CSS_IDENT_START_CHARS =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CSS_IDENT_CHARS = `${CSS_IDENT_START_CHARS}0123456789`;
const shortCssModuleNames = new Map<string, string>();
const cssModuleCache = new Map<
	string,
	{ cssText: string; nameMap: Record<string, string> }
>();
let nextShortCssModuleNameId = 0;

export default function styleLoader(
	options: StyleLoaderOptions = {},
): BunPlugin {
	const opts = { ...defaultOptions, ...options };

	return {
		name: "style-loader",
		async setup(build) {
			build.onLoad({ filter: /\.s?css$/ }, (args) => {
				const { contents, isCssModule } = loadStyleFile(args.path);

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

function encodeCssIdent(value: number): string {
	let ident = CSS_IDENT_START_CHARS[value % CSS_IDENT_START_CHARS.length];
	let remaining = Math.floor(value / CSS_IDENT_START_CHARS.length);

	while (remaining > 0) {
		remaining -= 1;
		ident += CSS_IDENT_CHARS[remaining % CSS_IDENT_CHARS.length];
		remaining = Math.floor(remaining / CSS_IDENT_CHARS.length);
	}

	return ident;
}

function getShortCssModuleName(path: string, compiledName: string): string {
	const key = `${path}:${compiledName}`;
	let name = shortCssModuleNames.get(key);
	if (name) return name;
	name = encodeCssIdent(nextShortCssModuleNameId);
	nextShortCssModuleNameId += 1;
	shortCssModuleNames.set(key, name);
	return name;
}

function shortenCssModuleNames(
	path: string,
	cssText: string,
	exports: Record<string, { name: string }> | undefined,
) {
	if (!exports) return { cssText, nameMap: {} as Record<string, string> };

	const renameEntries = Object.entries(exports).map(
		([key, item]) =>
			[key, item.name, getShortCssModuleName(path, item.name)] as const,
	);

	let shortenedCssText = cssText;
	for (const [, sourceName, shortName] of renameEntries.sort(
		(a, b) => b[1].length - a[1].length,
	)) {
		shortenedCssText = shortenedCssText.split(sourceName).join(shortName);
	}

	const nameMap = Object.fromEntries(
		renameEntries.map(([key, _sourceName, shortName]) => [key, shortName]),
	);

	return {
		cssText: shortenedCssText,
		nameMap,
	};
}

function restoreBackdropFilterFallback(css: string): string {
	return css.replace(
		/-webkit-backdrop-filter:\s*([^;]+);/g,
		(match, value, offset, source) => {
			const tail = source.slice(
				offset + match.length,
				offset + match.length + 80,
			);
			if (tail.includes("backdrop-filter")) return match;
			return `-webkit-backdrop-filter:${value};backdrop-filter:${value};`;
		},
	);
}

async function getCssModuleResult(
	content: string,
	filePath: string,
	options: CompileOptions = {},
) {
	const cached = cssModuleCache.get(filePath);
	if (cached) return cached;

	const imports: string[] = [];
	const targets = options.targets?.length
		? browserslistToTargets(options.targets)
		: undefined;
	const { code, exports } = transform({
		filename: filePath,
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
	const result = shortenCssModuleNames(filePath, cssText, exports);
	cssModuleCache.set(filePath, result);
	return result;
}

async function compileCSS(
	content: string,
	filePath: string,
	options: CompileOptions = {},
): Promise<OnLoadResult> {
	const imports: string[] = [];
	const targets = options.targets?.length
		? browserslistToTargets(options.targets)
		: undefined;
	const { code } = transform({
		filename: filePath,
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
		const { cssText: shortenedCssText, nameMap } = await getCssModuleResult(
			content,
			filePath,
			options,
		);
		return {
			contents: `export const code = ${JSON.stringify(shortenedCssText)};\nexport default ${JSON.stringify(nameMap)};`,
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
