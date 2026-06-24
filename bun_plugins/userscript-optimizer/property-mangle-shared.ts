import { Project, SyntaxKind, type TypeNode } from "ts-morph";

const MIN_MANGLED_INTERNAL_PROPERTY_LENGTH = 6;
const INTERNAL_PROPERTY_NAME_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
export const PROPERTY_MANGLE_PRESERVE_PATTERN =
	/@(?:external|mangle-preserve|public)\b/;
export const PROPERTY_MANGLE_FORCE_PATTERN = /@mangle-force\b/;

export function escapeRegex(value: string): string {
	return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

export function isManglableInternalPropertyName(name: string): boolean {
	return (
		name.length >= MIN_MANGLED_INTERNAL_PROPERTY_LENGTH &&
		INTERNAL_PROPERTY_NAME_PATTERN.test(name)
	);
}

export function addPropertyName(
	names: Set<string>,
	name: string,
	minLength = MIN_MANGLED_INTERNAL_PROPERTY_LENGTH,
) {
	if (name.length < minLength || !INTERNAL_PROPERTY_NAME_PATTERN.test(name)) {
		return;
	}
	names.add(name);
}

export function collectTypeLiteralPropertyNames(
	typeNodeText: string,
): string[] {
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

export function hasPropertyManglePreserveAnnotation(node: {
	getFullText: () => string;
}) {
	return PROPERTY_MANGLE_PRESERVE_PATTERN.test(node.getFullText());
}

export function hasPropertyMangleForceAnnotation(node: {
	getFullText: () => string;
}) {
	return PROPERTY_MANGLE_FORCE_PATTERN.test(node.getFullText());
}

export function collectPropertySignatureNames(
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
