import { Project, SyntaxKind } from "ts-morph";
import type { TypeScriptSourceTransform } from "./typescript-source-transform";

export default function cssModuleNamedImports(): TypeScriptSourceTransform {
	const project = new Project({
		useInMemoryFileSystem: true,
	});

	return {
		name: "css-module-named-imports",
		transform({ path, source }) {
			const sourceFile = project.createSourceFile(path, source, {
				overwrite: true,
			});
			let changed = false;

			for (const importDeclaration of sourceFile.getImportDeclarations()) {
				const defaultImport = importDeclaration.getDefaultImport();
				const moduleSpecifier = importDeclaration.getModuleSpecifierValue();
				if (!defaultImport || !moduleSpecifier.match(/\.module\.s?css$/)) {
					continue;
				}

				const localName = defaultImport.getText();
				const propertyAccesses = sourceFile
					.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)
					.filter((access) => access.getExpression().getText() === localName);
				if (propertyAccesses.length === 0) continue;

				const usedNames = Array.from(
					new Set(propertyAccesses.map((access) => access.getName())),
				).sort();
				const aliases = new Map(
					usedNames.map((name) => [name, `${localName}_${name}`] as const),
				);

				for (const access of propertyAccesses.reverse()) {
					const alias = aliases.get(access.getName());
					if (!alias) continue;
					access.replaceWithText(alias);
				}

				const namedImports = importDeclaration
					.getNamedImports()
					.map((namedImport) => namedImport.getText());
				for (const name of usedNames) {
					namedImports.push(`${name} as ${aliases.get(name)}`);
				}

				importDeclaration.replaceWithText(
					`import { ${namedImports.join(", ")} } from ${JSON.stringify(
						moduleSpecifier,
					)};`,
				);
				changed = true;
			}

			return changed ? sourceFile.getFullText() : source;
		},
	};
}
