import { readFile } from "node:fs/promises";
import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import {
	addPropertyName,
	collectPropertySignatureNames,
	collectTypeLiteralPropertyNames,
	hasPropertyMangleForceAnnotation,
	hasPropertyManglePreserveAnnotation,
} from "./property-mangle-shared";

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
		if (
			!nameNode ||
			nameNode.getKind() !== SyntaxKind.PropertyAccessExpression
		) {
			// (Keep standard SyntaxKind check but match exactly original check)
		}
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

export type DiscoveredInternalObjectProperties = {
	names: string[];
	reserved: string[];
	forced: string[];
};

export async function discoverInternalObjectProperties(
	scriptName: string,
): Promise<DiscoveredInternalObjectProperties> {
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

				const isUtilFile = filePath.split(path.sep).includes("util");

				for (const declaration of sourceFile.getClasses()) {
					for (const property of declaration.getProperties()) {
						if (
							hasPropertyManglePreserveAnnotation(declaration) ||
							hasPropertyManglePreserveAnnotation(property)
						) {
							addPropertyName(reserved, property.getName());
							continue;
						}
						if (
							!isUtilFile &&
							!property.getModifiers().some((m) => m.getText() === "private")
						) {
							continue;
						}
						if (hasPropertyMangleForceAnnotation(property)) {
							addPropertyName(forced, property.getName());
							continue;
						}
						addPropertyName(names, property.getName());
					}

					for (const constructorDec of declaration.getConstructors()) {
						for (const param of constructorDec.getParameters()) {
							const isPrivate = param
								.getModifiers()
								.some((m) => m.getText() === "private");
							const isProtected = param
								.getModifiers()
								.some((m) => m.getText() === "protected");
							const isPublic = param
								.getModifiers()
								.some((m) => m.getText() === "public");
							const isReadonly = param
								.getModifiers()
								.some((m) => m.getText() === "readonly");
							const isParamProperty =
								isPrivate || isProtected || isPublic || isReadonly;
							if (!isParamProperty) {
								continue;
							}
							if (
								hasPropertyManglePreserveAnnotation(declaration) ||
								hasPropertyManglePreserveAnnotation(param)
							) {
								addPropertyName(reserved, param.getName());
								continue;
							}
							if (!isUtilFile && !isPrivate) {
								continue;
							}
							if (hasPropertyMangleForceAnnotation(param)) {
								addPropertyName(forced, param.getName());
								continue;
							}
							addPropertyName(names, param.getName());
						}
					}

					for (const method of declaration.getMethods()) {
						if (
							hasPropertyManglePreserveAnnotation(declaration) ||
							hasPropertyManglePreserveAnnotation(method)
						) {
							addPropertyName(reserved, method.getName());
							continue;
						}
						if (
							!isUtilFile &&
							!method.getModifiers().some((m) => m.getText() === "private")
						) {
							continue;
						}
						if (hasPropertyMangleForceAnnotation(method)) {
							addPropertyName(forced, method.getName());
							continue;
						}
						addPropertyName(names, method.getName());
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
