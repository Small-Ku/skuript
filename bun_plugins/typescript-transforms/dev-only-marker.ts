import { readFile } from "node:fs/promises";
import path from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { TypeScriptSourceTransform } from "./typescript-source-transform";

const DEV_ONLY_PATTERN = /@dev-only\b/;
const FILE_LEVEL_DEV_ONLY_PATTERN =
	/^\s*(?:\/\*+\s*@dev-only\b.*|\s*\/\/\s*@dev-only\b.*)$/;
const MODULE_PATH_CANDIDATE_SUFFIXES = [
	"",
	".ts",
	".tsx",
	".js",
	".jsx",
	".mjs",
	".cjs",
	"/index.ts",
	"/index.tsx",
	"/index.js",
	"/index.jsx",
	"/index.mjs",
	"/index.cjs",
];

const moduleResolutionCache = new Map<string, Promise<string | undefined>>();
const devOnlyModuleCache = new Map<string, Promise<boolean>>();

function hasDevOnlyMarker(node: Node) {
	return DEV_ONLY_PATTERN.test(node.getFullText());
}

function isFileLevelDevOnlySource(source: string) {
	const [firstLine = ""] = source.split(/\r?\n/, 1);
	return FILE_LEVEL_DEV_ONLY_PATTERN.test(firstLine);
}

async function resolveModulePath(
	importerPath: string,
	moduleSpecifier: string,
): Promise<string | undefined> {
	if (!moduleSpecifier.startsWith(".")) {
		return undefined;
	}

	const cacheKey = `${importerPath}\n${moduleSpecifier}`;
	const cached = moduleResolutionCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const resolutionPromise = (async () => {
		const basePath = path.resolve(path.dirname(importerPath), moduleSpecifier);

		for (const suffix of MODULE_PATH_CANDIDATE_SUFFIXES) {
			const candidatePath = path.normalize(`${basePath}${suffix}`);
			try {
				const stat = Bun.file(candidatePath);
				if (await stat.exists()) {
					return candidatePath;
				}
			} catch {
				// Ignore failed candidate probes and keep resolving.
			}
		}

		return undefined;
	})();

	moduleResolutionCache.set(cacheKey, resolutionPromise);
	return resolutionPromise;
}

async function isDevOnlyModulePath(modulePath: string) {
	const normalizedPath = path.normalize(modulePath);
	const cached = devOnlyModuleCache.get(normalizedPath);
	if (cached) {
		return cached;
	}

	const probePromise = readFile(normalizedPath, "utf8")
		.then((source) => isFileLevelDevOnlySource(source))
		.catch(() => false);

	devOnlyModuleCache.set(normalizedPath, probePromise);
	return probePromise;
}

function stripDevOnlyObjectLiteralMembers(
	sourceFile: ReturnType<Project["createSourceFile"]>,
) {
	const removableMembers = sourceFile
		.getDescendants()
		.filter((node) => {
			if (
				!Node.isMethodDeclaration(node) &&
				!Node.isPropertyAssignment(node) &&
				!Node.isShorthandPropertyAssignment(node) &&
				!Node.isSpreadAssignment(node)
			) {
				return false;
			}

			return (
				node.getParentIfKind(SyntaxKind.ObjectLiteralExpression) !==
					undefined && hasDevOnlyMarker(node)
			);
		})
		.sort((a, b) => b.getStart() - a.getStart());

	for (const member of removableMembers) {
		member.remove();
	}

	return removableMembers.length > 0;
}

function addRemovalRange(
	ranges: Map<string, readonly [number, number]>,
	start: number,
	end: number,
) {
	ranges.set(`${start}:${end}`, [start, end] as const);
}

function getDeclaredNames(node: Node): Node[] {
	if (Node.isFunctionDeclaration(node)) {
		return node.getNameNode() ? [node.getNameNodeOrThrow()] : [];
	}

	if (Node.isVariableStatement(node)) {
		return node.getDeclarations().flatMap((declaration) => {
			const nameNode = declaration.getNameNode();
			return Node.isIdentifier(nameNode)
				? [nameNode]
				: nameNode.getDescendantsOfKind(SyntaxKind.Identifier);
		});
	}

	if (Node.isImportDeclaration(node)) {
		const names: Node[] = [];
		const defaultImport = node.getDefaultImport();
		if (defaultImport) {
			names.push(defaultImport);
		}
		const namespaceImport = node.getNamespaceImport();
		if (namespaceImport) {
			names.push(namespaceImport);
		}
		for (const namedImport of node.getNamedImports()) {
			names.push(namedImport.getAliasNode() ?? namedImport.getNameNode());
		}
		return names;
	}

	return [];
}

function collectDevOnlyDeclarations(
	sourceFile: ReturnType<Project["createSourceFile"]>,
) {
	return sourceFile.getDescendants().filter((node) => {
		return (
			(Node.isFunctionDeclaration(node) ||
				Node.isVariableStatement(node) ||
				Node.isExpressionStatement(node)) &&
			hasDevOnlyMarker(node)
		);
	});
}

async function collectDevOnlyImportDeclarations(
	sourceFile: ReturnType<Project["createSourceFile"]>,
	filePath: string,
) {
	const removableImports = [];

	for (const importDeclaration of sourceFile.getImportDeclarations()) {
		const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
		const modulePath = await resolveModulePath(filePath, moduleSpecifier);
		if (!modulePath) {
			continue;
		}
		if (!(await isDevOnlyModulePath(modulePath))) {
			continue;
		}
		removableImports.push(importDeclaration);
	}

	return removableImports;
}

function removeBoundUsages(
	initialDeclarations: Node[],
	sourceFile: ReturnType<Project["createSourceFile"]>,
) {
	const removalRanges = new Map<string, readonly [number, number]>();
	const removableNameQueue = initialDeclarations.flatMap((node) =>
		getDeclaredNames(node),
	);
	const seenNames = new Set<string>();

	for (const declaration of initialDeclarations) {
		addRemovalRange(
			removalRanges,
			declaration.getFullStart(),
			declaration.getEnd(),
		);
	}

	while (removableNameQueue.length > 0) {
		const declaredName = removableNameQueue.pop();
		if (!declaredName) {
			continue;
		}

		const key = `${declaredName.getSourceFile().getFilePath()}:${declaredName.getStart()}`;
		if (seenNames.has(key)) {
			continue;
		}
		seenNames.add(key);

		for (const reference of declaredName.findReferencesAsNodes()) {
			if (reference === declaredName) {
				continue;
			}

			const statement = reference.getFirstAncestor((ancestor) => {
				return (
					(Node.isStatement(ancestor) || Node.isImportDeclaration(ancestor)) &&
					!Node.isBlock(ancestor) &&
					!Node.isSourceFile(ancestor)
				);
			});
			if (!statement) {
				continue;
			}

			addRemovalRange(
				removalRanges,
				statement.getFullStart(),
				statement.getEnd(),
			);
			removableNameQueue.push(...getDeclaredNames(statement));
		}
	}

	for (const range of Array.from(removalRanges.values()).sort(
		(a, b) => b[0] - a[0],
	)) {
		sourceFile.replaceText(range, "");
	}

	return removalRanges.size > 0;
}

function removeUnusedImports(
	sourceFile: ReturnType<Project["createSourceFile"]>,
) {
	let changed = false;

	for (const importDeclaration of sourceFile
		.getImportDeclarations()
		.reverse()) {
		const defaultImport = importDeclaration.getDefaultImport();
		if (defaultImport && defaultImport.findReferencesAsNodes().length <= 1) {
			defaultImport.remove();
			changed = true;
		}

		const namespaceImport = importDeclaration.getNamespaceImport();
		if (
			namespaceImport &&
			namespaceImport.findReferencesAsNodes().length <= 1
		) {
			namespaceImport.remove();
			changed = true;
		}

		for (const namedImport of importDeclaration.getNamedImports().reverse()) {
			const localName = namedImport.getAliasNode() ?? namedImport.getNameNode();
			if (localName.findReferencesAsNodes().length <= 1) {
				namedImport.remove();
				changed = true;
			}
		}

		if (
			!importDeclaration.getDefaultImport() &&
			!importDeclaration.getNamespaceImport() &&
			importDeclaration.getNamedImports().length === 0
		) {
			importDeclaration.remove();
			changed = true;
		}
	}

	return changed;
}

function removeUnusedVariables(
	sourceFile: ReturnType<Project["createSourceFile"]>,
) {
	let changed = false;

	for (const variableStatement of sourceFile
		.getVariableStatements()
		.reverse()) {
		for (const declaration of variableStatement.getDeclarations().reverse()) {
			const nameNode = declaration.getNameNode();
			if (!Node.isIdentifier(nameNode)) {
				continue;
			}
			if (nameNode.findReferencesAsNodes().length > 1) {
				continue;
			}

			if (variableStatement.getDeclarations().length === 1) {
				variableStatement.remove();
			} else {
				declaration.remove();
			}
			changed = true;
		}
	}

	return changed;
}

function stripUnusedBindings(
	sourceFile: ReturnType<Project["createSourceFile"]>,
) {
	let changed = false;

	for (;;) {
		const didRemoveImports = removeUnusedImports(sourceFile);
		const didRemoveVariables = removeUnusedVariables(sourceFile);
		if (!didRemoveImports && !didRemoveVariables) {
			return changed;
		}
		changed = true;
	}
}

export default function devOnlyMarker(): TypeScriptSourceTransform {
	return {
		name: "dev-only-marker",
		async transform({ path: filePath, source }) {
			if (!DEV_ONLY_PATTERN.test(source)) {
				const sourceFile = new Project({
					useInMemoryFileSystem: true,
				}).createSourceFile(filePath, source, {
					overwrite: true,
				});
				const removableImports = await collectDevOnlyImportDeclarations(
					sourceFile,
					filePath,
				);
				if (removableImports.length === 0) {
					return source;
				}

				const didRemoveBoundUsages = removeBoundUsages(
					removableImports,
					sourceFile,
				);
				const didStripUnusedBindings = stripUnusedBindings(sourceFile);
				return didRemoveBoundUsages || didStripUnusedBindings
					? sourceFile.getFullText()
					: source;
			}

			const project = new Project({ useInMemoryFileSystem: true });
			const sourceFile = project.createSourceFile(filePath, source, {
				overwrite: true,
			});

			const removableImports = await collectDevOnlyImportDeclarations(
				sourceFile,
				filePath,
			);
			const removableDeclarations = collectDevOnlyDeclarations(sourceFile);
			const didStripMembers = stripDevOnlyObjectLiteralMembers(sourceFile);
			const didRemoveBoundUsages = removeBoundUsages(
				[...removableDeclarations, ...removableImports],
				sourceFile,
			);
			const didStripUnusedBindings = stripUnusedBindings(sourceFile);

			if (didStripMembers || didRemoveBoundUsages || didStripUnusedBindings) {
				return sourceFile.getFullText();
			}
			return source;
		},
	};
}
