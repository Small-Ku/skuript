import { readFile } from "node:fs/promises";
import path from "node:path";
import { Node, Project, SyntaxKind } from "ts-morph";
import type { TypeScriptSourceTransform } from "./typescript-source-transform";

const ANY_ENV_ONLY_PATTERN =
	/@(?:dev|development|prod|production|test)-(?:only|except|exclude|not)\b/;

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

function normalizeEnv(name: string): string | null {
	const cleaned = name.trim().toLowerCase();
	if (cleaned === "dev" || cleaned === "development") return "development";
	if (cleaned === "prod" || cleaned === "production") return "production";
	if (cleaned === "test") return "test";
	return null;
}

function shouldRemove(commentText: string, currentEnv: string): boolean {
	const normalizedCurrent = normalizeEnv(currentEnv) || "production";
	const matches = [...commentText.matchAll(/@([a-zA-Z0-9_-]+)\b/g)];

	for (const match of matches) {
		const fullTag = match[1];
		const onlyMatch = fullTag.match(/^([a-zA-Z0-9_]+)-(only)$/);
		const exceptMatch = fullTag.match(/^([a-zA-Z0-9_]+)-(except|exclude|not)$/);

		if (onlyMatch) {
			const env = normalizeEnv(onlyMatch[1]);
			if (env && normalizedCurrent !== env) {
				return true;
			}
		} else if (exceptMatch) {
			const env = normalizeEnv(exceptMatch[1]);
			if (env && normalizedCurrent === env) {
				return true;
			}
		}
	}

	return false;
}

function shouldRemoveFile(source: string, currentEnv: string): boolean {
	const [firstLine = ""] = source.split(/\r?\n/, 1);
	const isComment = /^\s*(?:\/\*+|\/\/)/.test(firstLine);
	if (!isComment) return false;
	return shouldRemove(firstLine, currentEnv);
}

function getAnnotationText(node: Node): string {
	let text = "";

	// 1. Get JSDoc comments
	if (Node.isJSDocable(node)) {
		for (const jsdoc of node.getJsDocs()) {
			text += `${jsdoc.getText()}\n`;
		}
	}

	// 2. Get leading comment ranges
	const sourceFile = node.getSourceFile();
	for (const range of node.getLeadingCommentRanges()) {
		text += `${sourceFile.getFullText().slice(range.getPos(), range.getEnd())}\n`;
	}

	return text;
}

function shouldRemoveNode(node: Node, currentEnv: string): boolean {
	return shouldRemove(getAnnotationText(node), currentEnv);
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

async function isDevOnlyModulePath(modulePath: string, currentEnv: string) {
	const normalizedPath = path.normalize(modulePath);
	const cacheKey = `${normalizedPath}:${currentEnv}`;
	const cached = devOnlyModuleCache.get(cacheKey);
	if (cached) {
		return cached;
	}

	const probePromise = readFile(normalizedPath, "utf8")
		.then((source) => shouldRemoveFile(source, currentEnv))
		.catch(() => false);

	devOnlyModuleCache.set(cacheKey, probePromise);
	return probePromise;
}

function stripDevOnlyObjectLiteralMembers(
	sourceFile: ReturnType<Project["createSourceFile"]>,
	currentEnv: string,
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
					undefined && shouldRemoveNode(node, currentEnv)
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
	if (Node.isFunctionDeclaration(node) || Node.isClassDeclaration(node)) {
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
	currentEnv: string,
) {
	return sourceFile.getDescendants().filter((node) => {
		return (
			(Node.isFunctionDeclaration(node) ||
				Node.isVariableStatement(node) ||
				Node.isExpressionStatement(node) ||
				Node.isClassDeclaration(node) ||
				Node.isIfStatement(node) ||
				Node.isInterfaceDeclaration(node) ||
				Node.isTypeAliasDeclaration(node) ||
				Node.isEnumDeclaration(node)) &&
			shouldRemoveNode(node, currentEnv)
		);
	});
}

async function collectDevOnlyImportDeclarations(
	sourceFile: ReturnType<Project["createSourceFile"]>,
	filePath: string,
	currentEnv: string,
) {
	const removableImports = [];

	for (const importDeclaration of sourceFile.getImportDeclarations()) {
		const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
		const modulePath = await resolveModulePath(filePath, moduleSpecifier);
		if (!modulePath) {
			continue;
		}
		if (!(await isDevOnlyModulePath(modulePath, currentEnv))) {
			continue;
		}
		removableImports.push(importDeclaration);
	}

	return removableImports;
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
	if (ranges.length <= 1) return ranges;
	// Sort by start index ascending, then by end index descending
	ranges.sort((a, b) => a[0] - b[0] || b[1] - a[1]);

	const merged: [number, number][] = [];
	let current = ranges[0];

	for (let i = 1; i < ranges.length; i++) {
		const next = ranges[i];
		if (next[0] <= current[1]) {
			current = [current[0], Math.max(current[1], next[1])];
		} else {
			merged.push(current);
			current = next;
		}
	}
	merged.push(current);
	return merged;
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

	const sortedMerged = mergeRanges(
		Array.from(removalRanges.values()).map((r) => [r[0], r[1]]),
	).sort((a, b) => b[0] - a[0]);

	let text = sourceFile.getFullText();
	for (const range of sortedMerged) {
		text = text.slice(0, range[0]) + text.slice(range[1]);
	}

	sourceFile.replaceWithText(text);

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
		if (variableStatement.isExported()) {
			continue;
		}
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

export default function envMarker(env?: string): TypeScriptSourceTransform {
	const currentEnv = env || process.env.NODE_ENV || "production";

	return {
		name: "env-marker",
		async transform({ path: filePath, source }) {
			const hasAnnotations = ANY_ENV_ONLY_PATTERN.test(source);
			if (!hasAnnotations) {
				const sourceFile = new Project({
					useInMemoryFileSystem: true,
				}).createSourceFile(filePath, source, {
					overwrite: true,
				});
				const removableImports = await collectDevOnlyImportDeclarations(
					sourceFile,
					filePath,
					currentEnv,
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
				currentEnv,
			);
			const removableDeclarations = collectDevOnlyDeclarations(
				sourceFile,
				currentEnv,
			);
			const didStripMembers = stripDevOnlyObjectLiteralMembers(
				sourceFile,
				currentEnv,
			);
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
