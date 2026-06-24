import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BuildOutput, BunPlugin } from "bun";
import { type ECMA, type MinifyOptions, minify } from "terser";
import { Project, SyntaxKind, type TypeNode } from "ts-morph";
import { getCssCustomPropertyRenameEntries } from "./style-loader";
import type { TypeScriptSourceTransform } from "./typescript-source-transform";

type UserscriptOptimizerPluginOptions = {
	ecma: number;
	scriptName: string;
	headerText: string;
	logger: { info: (message: string) => void; warn: (message: string) => void };
};

const MIN_MANGLED_INTERNAL_PROPERTY_LENGTH = 6;
const INTERNAL_PROPERTY_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const PROPERTY_MANGLE_PRESERVE_PATTERN =
	/@(?:external|mangle-preserve|public)\b/;
const PROPERTY_MANGLE_FORCE_PATTERN = /@mangle-force\b/;
let terserDomPropertyNamesPromise: Promise<Set<string>> | undefined;

function escapeRegex(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

function isManglableInternalPropertyName(name: string): boolean {
	return (
		name.length >= MIN_MANGLED_INTERNAL_PROPERTY_LENGTH &&
		INTERNAL_PROPERTY_NAME_PATTERN.test(name)
	);
}

function addPropertyName(
	names: Set<string>,
	name: string,
	minLength = MIN_MANGLED_INTERNAL_PROPERTY_LENGTH,
) {
	if (name.length < minLength || !INTERNAL_PROPERTY_NAME_PATTERN.test(name)) {
		return;
	}
	names.add(name);
}

function collectTypeLiteralPropertyNames(typeNodeText: string): string[] {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile(
		"inline-type.ts",
		`type Inline = ${typeNodeText};`,
	);
	const typeNode = sourceFile.getTypeAliasOrThrow("Inline").getTypeNode();
	if (!typeNode) return [];
	return typeNode
		.getDescendantsOfKind(SyntaxKind.PropertySignature)
		.map((property) => property.getName())
		.filter(isManglableInternalPropertyName);
}

function hasPropertyManglePreserveAnnotation(node: {
	getFullText: () => string;
}) {
	return PROPERTY_MANGLE_PRESERVE_PATTERN.test(node.getFullText());
}

function hasPropertyMangleForceAnnotation(node: { getFullText: () => string }) {
	return PROPERTY_MANGLE_FORCE_PATTERN.test(node.getFullText());
}

function collectPropertySignatureNames(
	typeNode: TypeNode,
	names: Set<string>,
	reserved: Set<string>,
) {
	for (const property of typeNode.getDescendantsOfKind(
		SyntaxKind.PropertySignature,
	)) {
		if (hasPropertyManglePreserveAnnotation(property)) {
			addPropertyName(reserved, property.getName());
			continue;
		}
		addPropertyName(names, property.getName());
	}
}

function collectObjectLiteralPropertyNames(
	sourceFile: Project["createSourceFile"] extends (...args: never[]) => infer T
		? T
		: never,
	names: Set<string>,
	reserved: Set<string>,
) {
	for (const property of sourceFile.getDescendantsOfKind(
		SyntaxKind.PropertyAssignment,
	)) {
		const nameNode = property.getNameNode();
		if (!nameNode || nameNode.getKind() !== SyntaxKind.Identifier) {
			continue;
		}
		const name = nameNode.getText();
		if (hasPropertyManglePreserveAnnotation(property)) {
			addPropertyName(reserved, name);
			continue;
		}
		addPropertyName(names, name);
	}
}

async function discoverInternalObjectPropertyNames(
	scriptName: string,
): Promise<{ names: string[]; reserved: string[]; forced: string[] }> {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceRoots = [path.join("src", scriptName), path.join("src", "util")];
	const names = new Set<string>();
	const reserved = new Set<string>();
	const forced = new Set<string>();

	for (const sourceRoot of sourceRoots) {
		for (const globPattern of ["**/*.ts", "**/*.tsx"]) {
			const glob = new Bun.Glob(globPattern);
			for await (const file of glob.scan({ cwd: sourceRoot })) {
				const filePath = path.join(sourceRoot, file);
				const source = await readFile(filePath, "utf8");
				const sourceFile = project.createSourceFile(filePath, source, {
					overwrite: true,
				});
				const shorthandPropertyNames = new Set(
					sourceFile
						.getDescendantsOfKind(SyntaxKind.ShorthandPropertyAssignment)
						.map((property) => property.getName()),
				);

				for (const declaration of sourceFile.getInterfaces()) {
					for (const property of declaration.getProperties()) {
						if (
							hasPropertyManglePreserveAnnotation(declaration) ||
							hasPropertyManglePreserveAnnotation(property)
						) {
							addPropertyName(reserved, property.getName());
							continue;
						}
						addPropertyName(names, property.getName());
					}
				}

				collectObjectLiteralPropertyNames(sourceFile, names, reserved);

				for (const declaration of sourceFile.getTypeAliases()) {
					const typeNode = declaration.getTypeNode();
					if (!typeNode) continue;
					if (hasPropertyManglePreserveAnnotation(declaration)) {
						for (const name of collectTypeLiteralPropertyNames(
							typeNode.getText(),
						)) {
							addPropertyName(reserved, name);
						}
						continue;
					}
					collectPropertySignatureNames(typeNode, names, reserved);
				}

				for (const declaration of sourceFile.getClasses()) {
					for (const property of declaration.getProperties()) {
						if (
							hasPropertyManglePreserveAnnotation(declaration) ||
							hasPropertyManglePreserveAnnotation(property)
						) {
							addPropertyName(reserved, property.getName());
							continue;
						}
						if (!property.getText().trimStart().startsWith("private ")) {
							continue;
						}
						if (hasPropertyMangleForceAnnotation(property)) {
							addPropertyName(forced, property.getName());
							continue;
						}
						addPropertyName(names, property.getName());
					}
				}

				for (const declaration of sourceFile.getDescendantsOfKind(
					SyntaxKind.VariableDeclaration,
				)) {
					const name = declaration.getName();
					if (!shorthandPropertyNames.has(name)) {
						continue;
					}
					const variableStatement = declaration.getVariableStatement();
					if (
						hasPropertyManglePreserveAnnotation(declaration) ||
						(variableStatement &&
							hasPropertyManglePreserveAnnotation(variableStatement))
					) {
						addPropertyName(reserved, name);
						continue;
					}
					addPropertyName(names, name);
				}
			}
		}
	}

	for (const name of reserved) {
		names.delete(name);
		forced.delete(name);
	}

	return {
		names: Array.from(names).sort((a, b) => b.length - a.length),
		reserved: Array.from(reserved).sort((a, b) => b.length - a.length),
		forced: Array.from(forced).sort((a, b) => b.length - a.length),
	};
}

type DiscoveredProperties = Awaited<
	ReturnType<typeof discoverInternalObjectPropertyNames>
>;

function createPropertyMangleRegex(
	internalObjectPropertyNames: string[],
): RegExp {
	const propertyPattern = internalObjectPropertyNames
		.map(escapeRegex)
		.join("|");
	if (!propertyPattern) return /^_/;
	return new RegExp(`^(${propertyPattern}|_.*)$`);
}

function renameCssCustomProperties(code: string): string {
	let result = code;

	for (const [sourceName, renamed] of getCssCustomPropertyRenameEntries()) {
		result = result.replace(
			new RegExp(
				`(?<![A-Za-z0-9_-])${escapeRegex(sourceName)}(?![A-Za-z0-9_-])`,
				"g",
			),
			renamed,
		);
	}

	return result;
}

/**
 * Scans a TypeScript source file for `private` class properties annotated with
 * `@mangle-force` and renames them to `_mf_<name>` using ts-morph's language-
 * service rename. This correctly targets only the class member declaration and
 * its `this.name` accesses — it will not touch real DOM property accesses on
 * other objects (e.g. `element.isActive`), unlike a regex approach which cannot
 * distinguish receiver types.
 *
 * Because `private` members are only accessible within the declaring class, the
 * rename is always self-contained to this file. No cross-file coordination or
 * `defer()` is needed.
 *
 * Returns the modified source, or the original source unchanged if no forced
 * properties were found.
 */
function renameMangleForcePropertiesInSource(source: string): string {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile("source.ts", source);
	let didRename = false;

	for (const cls of sourceFile.getClasses()) {
		for (const prop of cls.getProperties()) {
			if (!prop.getText().trimStart().startsWith("private ")) continue;
			if (!hasPropertyMangleForceAnnotation(prop)) continue;
			const name = prop.getName();
			if (!isManglableInternalPropertyName(name)) continue;
			// Language-service rename: renames the declaration and every in-file
			// reference (this.name accesses within the class body).
			prop.rename(`_mf_${name}`);
			didRename = true;
		}
	}

	return didRename ? sourceFile.getFullText() : source;
}

export function mangleForcePropertiesSourceTransform(): TypeScriptSourceTransform {
	return {
		name: "mangle-force-properties",
		transform({ source }) {
			if (!PROPERTY_MANGLE_FORCE_PATTERN.test(source)) {
				return source;
			}
			return renameMangleForcePropertiesInSource(source);
		},
	};
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

async function optimizeUserscriptCode(
	options: Pick<UserscriptOptimizerPluginOptions, "ecma" | "logger"> & {
		body: string;
		internalObjectProperties: DiscoveredProperties;
	},
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

	return renameCssCustomProperties(minified.code);
}

/** @see https://bun.sh/docs/bundler/plugins — onEnd is documented but not yet in bun-types. */
type PluginBuilderWithOnEnd = Parameters<NonNullable<BunPlugin["setup"]>>[0] & {
	onEnd(callback: (result: BuildOutput) => void | Promise<void>): void;
};

export default function userscriptOptimizer(
	options: UserscriptOptimizerPluginOptions,
): BunPlugin {
	return {
		name: "userscript-optimizer",
		setup(build) {
			// Discovery runs for the Terser mangle regex in onEnd.
			// Start it eagerly so it overlaps with Bun's module graph resolution.
			const discoveryPromise = discoverInternalObjectPropertyNames(
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
					const optimizedBody = await optimizeUserscriptCode({
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
