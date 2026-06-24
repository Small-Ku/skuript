import { readFile } from "node:fs/promises";
import path from "node:path";
import { Project } from "ts-morph";
import {
	hasPropertyMangleForceAnnotation,
	isManglableInternalPropertyName,
} from "../userscript-optimizer/property-mangle-shared";
import type { TypeScriptSourceTransform } from "./typescript-source-transform";

function normalizePath(filePath: string): string {
	return path.resolve(filePath).replace(/\\/g, "/");
}

type Options = {
	scriptName?: string;
	precedingTransforms?: TypeScriptSourceTransform[];
};

/**
 * Scans TypeScript source files under the target directories and renames properties/methods
 * annotated with `@mangle-force` to `_mf_<name>`.
 *
 * It initializes a single in-memory ts-morph Project containing all project source files,
 * allowing it to perform a cross-file rename of public/protected members (such as LinkedMap methods
 * imported by files under src/novele).
 */
export function mangleForcePropertiesSourceTransform(
	options?: Options,
): TypeScriptSourceTransform {
	const scriptName = options?.scriptName ?? "novele";
	let projectPromise: Promise<Map<string, string>> | null = null;

	const initializeProject = async (): Promise<Map<string, string>> => {
		const project = new Project({ useInMemoryFileSystem: true });
		const sourceRoots = [
			path.join("src", scriptName),
			path.join("src", "util"),
		];
		const filesToProcess: string[] = [];

		for (const sourceRoot of sourceRoots) {
			for (const globPattern of ["**/*.ts", "**/*.tsx"]) {
				const glob = new Bun.Glob(globPattern);
				for await (const file of glob.scan({ cwd: sourceRoot })) {
					const filePath = path.join(sourceRoot, file);
					filesToProcess.push(filePath);
				}
			}
		}

		// Read and add all files to the project first
		for (const filePath of filesToProcess) {
			let source = await readFile(filePath, "utf8");
			// Pre-apply earlier transforms so that we don't override/lose them in the project-wide rename
			if (options?.precedingTransforms) {
				for (const transform of options.precedingTransforms) {
					source = await transform.transform({ path: filePath, source });
				}
			}

			project.createSourceFile(path.resolve(filePath), source, {
				overwrite: true,
			});
		}

		// Perform renames project-wide
		for (const sourceFile of project.getSourceFiles()) {
			for (const cls of sourceFile.getClasses()) {
				for (const prop of cls.getProperties()) {
					if (!hasPropertyMangleForceAnnotation(prop)) continue;
					const name = prop.getName();
					if (!isManglableInternalPropertyName(name)) continue;
					prop.rename(`_mf_${name}`);
				}

				for (const constructorDec of cls.getConstructors()) {
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
						if (!isParamProperty) continue;

						if (!hasPropertyMangleForceAnnotation(param)) continue;
						const name = param.getName();
						if (!isManglableInternalPropertyName(name)) continue;
						param.rename(`_mf_${name}`);
					}
				}

				for (const method of cls.getMethods()) {
					if (!hasPropertyMangleForceAnnotation(method)) continue;
					const name = method.getName();
					if (!isManglableInternalPropertyName(name)) continue;
					method.rename(`_mf_${name}`);
				}
			}
		}

		// Collect the transformed source code of all files
		const resultMap = new Map<string, string>();
		for (const sourceFile of project.getSourceFiles()) {
			resultMap.set(
				normalizePath(sourceFile.getFilePath()),
				sourceFile.getFullText(),
			);
		}
		return resultMap;
	};

	return {
		name: "mangle-force-properties",
		async transform({ path: filePath, source }) {
			const isSourceFile =
				filePath.includes(`${path.sep}${scriptName}${path.sep}`) ||
				filePath.includes(`${path.sep}util${path.sep}`);

			if (!isSourceFile) {
				return source;
			}

			// Optimistically check if the file or any file could have @mangle-force.
			// Since we want to ensure any cross-file references are renamed, we should
			// trigger project-wide rename if it hasn't run yet.
			if (!projectPromise) {
				projectPromise = initializeProject();
			}

			const renamedFiles = await projectPromise;
			const normalizedKey = normalizePath(filePath);
			const transformedSource = renamedFiles.get(normalizedKey);

			return transformedSource ?? source;
		},
	};
}
