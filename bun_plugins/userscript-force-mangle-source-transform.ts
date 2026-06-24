import { Project } from "ts-morph";
import type { TypeScriptSourceTransform } from "./typescript-source-transform";
import {
	hasPropertyMangleForceAnnotation,
	isManglableInternalPropertyName,
	PROPERTY_MANGLE_FORCE_PATTERN,
} from "./userscript-property-mangle-shared";

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
