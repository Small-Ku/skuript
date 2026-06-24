import { readFile } from "node:fs/promises";
import path from "node:path";
import { type ECMA, type MinifyOptions, minify } from "terser";
import { renameUserscriptCssCustomProperties } from "./userscript-css-custom-property-rename";
import type { DiscoveredInternalObjectProperties } from "./userscript-internal-property-discovery";
import { escapeRegex } from "./userscript-property-mangle-shared";

type UserscriptMinifiedBodyOptions = {
	body: string;
	ecma: number;
	internalObjectProperties: DiscoveredInternalObjectProperties;
	logger: { info: (message: string) => void; warn: (message: string) => void };
};

let terserDomPropertyNamesPromise: Promise<Set<string>> | undefined;

function createPropertyMangleRegex(
	internalObjectPropertyNames: string[],
): RegExp {
	const propertyPattern = internalObjectPropertyNames
		.map(escapeRegex)
		.join("|");
	if (!propertyPattern) return /^_/;
	return new RegExp(`^(${propertyPattern}|_.*)$`);
}

async function getTerserDomPropertyNames() {
	terserDomPropertyNamesPromise ??= readFile(
		path.join("node_modules", "terser", "tools", "domprops.js"),
		"utf8",
	).then((source) => {
		const names = new Set<string>();
		for (const match of source.matchAll(/"((?:\\.|[^"\\])+)"/g)) {
			names.add(JSON.parse(`"${match[1]}"`) as string);
		}
		return names;
	});
	return terserDomPropertyNamesPromise;
}

export async function buildUserscriptMinifiedBody(
	options: UserscriptMinifiedBodyOptions,
): Promise<string> {
	const { internalObjectProperties } = options;
	const terserDomPropertyNames = await getTerserDomPropertyNames();
	const safelistCollisions = internalObjectProperties.names.filter((name) =>
		terserDomPropertyNames.has(name),
	);
	if (safelistCollisions.length) {
		options.logger.warn(
			`Userscript property mangle skipped ${safelistCollisions.length} Terser DOM safelist collision(s): ${safelistCollisions.join(", ")}. Rename internal-only fields if you want them shortened in the compiled userscript.`,
		);
	}
	const forcedMangleNames = internalObjectProperties.forced;
	if (forcedMangleNames.length) {
		const forcedCollisions = forcedMangleNames.filter((name) =>
			terserDomPropertyNames.has(name),
		);
		if (forcedCollisions.length) {
			options.logger.info(
				`Userscript property mangle: renamed ${forcedCollisions.length} DOM safelist name(s) tagged @mangle-force in the TypeScript source transform pipeline: ${forcedCollisions.join(", ")}.`,
			);
		}
	}
	const minifyOptions: MinifyOptions = {
		ecma: options.ecma as ECMA,
		compress: {
			passes: 3,
			unsafe: true,
			unsafe_arrows: true,
			unsafe_methods: true,
			keep_fargs: false,
			reduce_funcs: true,
		},
		mangle: {
			toplevel: true,
			properties: {
				keep_quoted: "strict",
				regex: createPropertyMangleRegex(internalObjectProperties.names),
				reserved: internalObjectProperties.reserved,
			},
		},
		toplevel: true,
		format: {
			comments: false,
		},
	};
	// @mangle-force properties are already renamed to _mf_* in the source by
	// the onLoad handler. The _..* pattern in the mangle regex covers _mf_* automatically.
	const minified = await minify(options.body, minifyOptions);
	if (!minified.code) {
		throw new Error("Terser did not return minified code.");
	}

	return renameUserscriptCssCustomProperties(minified.code);
}
