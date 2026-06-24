import { getCssCustomPropertyRenameEntries } from "./style-loader";
import { escapeRegex } from "./userscript-property-mangle-shared";

export function renameUserscriptCssCustomProperties(code: string): string {
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
