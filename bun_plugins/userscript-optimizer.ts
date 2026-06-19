import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BunPlugin } from "bun";
import { type MinifyOptions, minify } from "terser";
import { Project, SyntaxKind } from "ts-morph";
import { getCssCustomPropertyRenameEntries } from "./style-loader";

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

function collectPropertySignatureNames(
	typeNode: {
		getDescendantsOfKind: (
			kind: SyntaxKind,
		) => { getName: () => string; getFullText: () => string }[];
	},
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
): Promise<{ names: string[]; reserved: string[] }> {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceRoots = [path.join("src", scriptName), path.join("src", "util")];
	const names = new Set<string>();
	const reserved = new Set<string>();

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
	}

	return {
		names: Array.from(names).sort((a, b) => b.length - a.length),
		reserved: Array.from(reserved).sort((a, b) => b.length - a.length),
	};
}

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
	options: Pick<
		UserscriptOptimizerPluginOptions,
		"ecma" | "scriptName" | "logger"
	> & { body: string },
): Promise<string> {
	const internalObjectProperties = await discoverInternalObjectPropertyNames(
		options.scriptName,
	);
	const terserDomPropertyNames = await getTerserDomPropertyNames();
	const safelistCollisions = internalObjectProperties.names.filter((name) =>
		terserDomPropertyNames.has(name),
	);
	if (safelistCollisions.length) {
		options.logger.warn(
			`Userscript property mangle skipped ${safelistCollisions.length} Terser DOM safelist collision(s): ${safelistCollisions.join(", ")}. Rename internal-only fields if you want them shortened in the compiled userscript.`,
		);
	}
	const minifyOptions: MinifyOptions = {
		ecma: options.ecma,
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
	const minified = await minify(options.body, minifyOptions);
	if (!minified.code) {
		throw minified.error ?? new Error("Terser did not return minified code.");
	}

	return renameCssCustomProperties(minified.code);
}

type PluginBuilderWithOnEnd = Parameters<NonNullable<BunPlugin["setup"]>>[0] & {
	onEnd(callback: (result: Bun.BuildOutput) => void | Promise<void>): void;
};

export default function userscriptOptimizer(
	options: UserscriptOptimizerPluginOptions,
): BunPlugin {
	return {
		name: "userscript-optimizer",
		setup(build) {
			(build as PluginBuilderWithOnEnd).onEnd(async (result) => {
				if (!result.success) {
					return;
				}

				for (const output of result.outputs) {
					if (output.kind !== "entry-point") {
						continue;
					}

					const source = await output.text();
					const optimizedBody = await optimizeUserscriptCode({
						body: source,
						ecma: options.ecma,
						logger: options.logger,
						scriptName: options.scriptName,
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
