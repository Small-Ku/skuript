import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import type { TypeScriptSourceTransform } from "./typescript-source-transform";

const DENSE_ENUM_VALUES_PATTERN = /@dense-enum-values\s+([^\r\n*]+)/;

export type DenseEnumValuesLogger = {
	warn: (message: string) => void;
};

function parseDenseEnumAnnotationValues(annotationText: string) {
	return annotationText
		.split(/[,\s]+/)
		.map((value) => value.trim())
		.filter(Boolean);
}

function getArrayLiteralInitializer(declaration: {
	getInitializer: () =>
		| {
				getKind: () => SyntaxKind;
				getExpression?: () => unknown;
		  }
		| undefined;
	getInitializerIfKind: (kind: SyntaxKind) =>
		| {
				getElements: () => unknown[];
		  }
		| undefined;
}) {
	const directInitializer = declaration.getInitializerIfKind(
		SyntaxKind.ArrayLiteralExpression,
	);
	if (directInitializer) {
		return directInitializer;
	}

	const initializer = declaration.getInitializer();
	if (!initializer || initializer.getKind() !== SyntaxKind.AsExpression) {
		return undefined;
	}

	const expression = (
		initializer as {
			getExpression: () =>
				| {
						getKind: () => SyntaxKind;
						getElements?: () => unknown[];
				  }
				| undefined;
		}
	).getExpression();
	return expression?.getKind() === SyntaxKind.ArrayLiteralExpression
		? (expression as { getElements: () => unknown[] })
		: undefined;
}

export function rewriteAnnotatedDenseEnumValues(
	source: string,
	filePath: string,
	logger?: DenseEnumValuesLogger,
) {
	const project = new Project({ useInMemoryFileSystem: true });
	const sourceFile = project.createSourceFile(filePath, source, {
		overwrite: true,
	});
	const rewrittenLiteralValues = new Set<string>();
	let changed = false;

	for (const statement of sourceFile.getVariableStatements()) {
		const annotationMatch = statement
			.getFullText()
			.match(DENSE_ENUM_VALUES_PATTERN);
		if (!annotationMatch) {
			continue;
		}

		const declarations = statement.getDeclarations();
		if (declarations.length !== 1) {
			throw new Error(
				`${filePath}: @dense-enum-values requires exactly one variable declaration.`,
			);
		}

		const declaration = declarations[0];
		const initializer = getArrayLiteralInitializer(declaration);
		if (!initializer) {
			throw new Error(
				`${filePath}: @dense-enum-values requires an array literal initializer.`,
			);
		}

		const replacementValues = parseDenseEnumAnnotationValues(
			annotationMatch[1],
		);
		const elements = initializer.getElements();
		if (elements.length !== replacementValues.length) {
			throw new Error(
				`${filePath}: @dense-enum-values replacement count ${replacementValues.length} does not match array length ${elements.length}.`,
			);
		}

		for (const [index, element] of elements.entries()) {
			if (element.getKind() !== SyntaxKind.StringLiteral) {
				throw new Error(
					`${filePath}: @dense-enum-values only supports string literal arrays.`,
				);
			}
			const originalValue = element.getText().slice(1, -1);
			const replacementValue = replacementValues[index];
			if (originalValue === replacementValue) {
				continue;
			}
			rewrittenLiteralValues.add(originalValue);
			element.replaceWithText(JSON.stringify(replacementValue));
			changed = true;
		}
	}

	if (logger && rewrittenLiteralValues.size > 0) {
		const leakedLiterals = sourceFile
			.getDescendantsOfKind(SyntaxKind.StringLiteral)
			.filter((literal) => rewrittenLiteralValues.has(literal.getLiteralText()))
			.map(
				(literal) =>
					`${literal.getLiteralText()}@L${literal.getStartLineNumber()}`,
			);
		if (leakedLiterals.length > 0) {
			logger.warn(
				`${path.relative(process.cwd(), filePath)} still contains readable dense-enum literal(s) outside annotated arrays: ${leakedLiterals.join(", ")}. Use exported tuple members/constants instead of repeating those raw string values if you want production compaction to stay correct.`,
			);
		}
	}

	return changed ? sourceFile.getFullText() : source;
}

type DenseEnumValuesPluginOptions = {
	logger?: DenseEnumValuesLogger;
};

export default function denseEnumValues(
	options: DenseEnumValuesPluginOptions = {},
): TypeScriptSourceTransform {
	return {
		name: "dense-enum-values",
		transform({ path, source }) {
			return rewriteAnnotatedDenseEnumValues(source, path, options.logger);
		},
	};
}
