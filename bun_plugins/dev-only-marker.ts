import { Node, Project, SyntaxKind } from "ts-morph";
import type { TypeScriptSourceTransform } from "./typescript-source-transform";

const DEV_ONLY_PATTERN = /@dev-only\b/;

function stripDevOnlyStatements(
	sourceFile: ReturnType<Project["createSourceFile"]>,
): boolean {
	const removableStatements = sourceFile
		.getDescendants()
		.filter(
			(node) =>
				Node.isExpressionStatement(node) &&
				DEV_ONLY_PATTERN.test(node.getFullText()),
		)
		.map((node) => [node.getFullStart(), node.getEnd()] as const)
		.sort((a, b) => b[0] - a[0]);

	for (const statementRange of removableStatements) {
		sourceFile.replaceText(statementRange, "");
	}

	return removableStatements.length > 0;
}

function stripDevOnlyObjectLiteralMembers(
	sourceFile: ReturnType<Project["createSourceFile"]>,
): string {
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
					undefined && DEV_ONLY_PATTERN.test(node.getFullText())
			);
		})
		.sort((a, b) => b.getStart() - a.getStart());

	for (const member of removableMembers) {
		member.remove();
	}

	return removableMembers.length > 0 ? sourceFile.getFullText() : "";
}

export default function devOnlyMarker(): TypeScriptSourceTransform {
	return {
		name: "dev-only-marker",
		transform({ path, source }) {
			if (!DEV_ONLY_PATTERN.test(source)) {
				return source;
			}

			const project = new Project({ useInMemoryFileSystem: true });
			const sourceFile = project.createSourceFile(path, source, {
				overwrite: true,
			});
			const memberResult = stripDevOnlyObjectLiteralMembers(sourceFile);
			const didStripStatements = stripDevOnlyStatements(sourceFile);
			if (memberResult || didStripStatements) {
				return sourceFile.getFullText();
			}
			return source;
		},
	};
}
