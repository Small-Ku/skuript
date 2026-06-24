// Ported from https://github.com/taggon/bun-style-loader

import fs from "node:fs";
import type { BunPlugin, OnLoadResult } from "bun";
import {
	type CSSModulesConfig,
	Features,
	type Targets,
	transform,
} from "lightningcss-wasm";
import * as sass from "sass";

/**
 * No options for now
 */
export type StyleLoaderOptions = {
	targets?: Targets;
	cssModules?: boolean | CSSModulesConfig;
	minifyCustomProperties?: boolean;
};

const defaultOptions: StyleLoaderOptions = {
	cssModules: false,
	minifyCustomProperties: true,
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
const shortCssCustomPropertyNames = new Map<string, string>();
const cssModuleCache = new Map<
	string,
	{
		cssText: string;
		nameMap: Record<string, string>;
		cssCustomPropertyMap: Record<string, string>;
	}
>();
let nextShortCssModuleNameId = 0;
let nextShortCssCustomPropertyNameId = 0;

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
					minifyCustomProperties: opts.minifyCustomProperties,
				});
			});
		},
	};
}

type CompileOptions = {
	cssModules?: boolean | CSSModulesConfig;
	targets?: Targets;
	minifyCustomProperties?: boolean;
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

function escapeRegex(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
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

function normalizeCssCustomPropertyName(name: string): string {
	return name.startsWith("--") ? name : `--${name}`;
}

function getShortCssCustomPropertyName(name: string): string {
	const normalizedName = normalizeCssCustomPropertyName(name);
	let renamed = shortCssCustomPropertyNames.get(normalizedName);
	if (renamed) return renamed;
	renamed = `--${encodeCssIdent(nextShortCssCustomPropertyNameId)}`;
	nextShortCssCustomPropertyNameId += 1;
	shortCssCustomPropertyNames.set(normalizedName, renamed);
	return renamed;
}

export function getCssCustomPropertyRenameEntries(): [string, string][] {
	return Array.from(shortCssCustomPropertyNames.entries()).sort(
		(a, b) => b[0].length - a[0].length || a[0].localeCompare(b[0]),
	);
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
		shortenedCssText = shortenedCssText.replace(
			new RegExp(
				`(?<![-_a-zA-Z0-9])${escapeRegex(sourceName)}(?![-_a-zA-Z0-9])`,
				"g",
			),
			shortName,
		);
	}

	const nameMap = Object.fromEntries(
		renameEntries.map(([key, _sourceName, shortName]) => [key, shortName]),
	);

	return {
		cssText: shortenedCssText,
		nameMap,
	};
}

function createCssCustomPropertyVisitor(
	cssCustomPropertyNames: Set<string>,
	minifyCustomProperties: boolean,
): NonNullable<Parameters<typeof transform>[0]["visitor"]> {
	if (!minifyCustomProperties) return {};
	return {
		Declaration: {
			custom(property) {
				if (!property.name.startsWith("--")) {
					return;
				}
				const renamed = getShortCssCustomPropertyName(property.name);
				cssCustomPropertyNames.add(
					normalizeCssCustomPropertyName(property.name),
				);
				return {
					property: "custom",
					value: {
						...property,
						name: renamed,
					},
				};
			},
		},
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
	const cssCustomPropertyNames = new Set<string>();
	const { code, exports } = transform({
		filename: filePath,
		code: new Uint8Array(Buffer.from(content)),
		cssModules: options.cssModules,
		minify: true,
		targets: options.targets,
		visitor: {
			...createCssCustomPropertyVisitor(
				cssCustomPropertyNames,
				options.minifyCustomProperties ?? true,
			),
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
	const cssCustomPropertyMap = Object.fromEntries(
		Array.from(cssCustomPropertyNames, (name) => [
			name,
			getShortCssCustomPropertyName(name),
		]),
	);
	const cachedResult = {
		...result,
		cssCustomPropertyMap,
	};
	cssModuleCache.set(filePath, cachedResult);
	return cachedResult;
}

async function compileCSS(
	content: string,
	filePath: string,
	options: CompileOptions = {},
): Promise<OnLoadResult> {
	const imports: string[] = [];
	const cssCustomPropertyNames = new Set<string>();
	const { code } = transform({
		filename: filePath,
		code: new Uint8Array(Buffer.from(content)),
		cssModules: options.cssModules,
		minify: true,
		include: Features.VendorPrefixes,
		targets: options.targets,
		visitor: {
			...createCssCustomPropertyVisitor(
				cssCustomPropertyNames,
				options.minifyCustomProperties ?? true,
			),
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
		const {
			cssText: shortenedCssText,
			nameMap,
			cssCustomPropertyMap,
		} = await getCssModuleResult(content, filePath, options);
		const namedExports = Object.entries(nameMap)
			.map(([key, value]) => `export const ${key} = ${JSON.stringify(value)};`)
			.join("\n");
		return {
			contents: `${namedExports}\nexport const code = ${JSON.stringify(shortenedCssText)};\nexport const cssCustomPropertyMap = ${JSON.stringify(cssCustomPropertyMap)};\nexport default ${JSON.stringify(nameMap)};`,
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
