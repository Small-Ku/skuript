// Fix the TypeScript error
// "Cannot find module './logo.svg' or its corresponding type declarations."

declare module "*.module.css" {
	const nameMap: Record<string, string>;
	export default nameMap;
	export const code: string;
}

declare module "*.module.scss" {
	const nameMap: Record<string, string>;
	export default nameMap;
	export const code: string;
}

declare module "*.css" {
	const code: string;
	export default code;
}

declare module "*.scss" {
	const code: string;
	export default code;
}

// Declare needed GM APIs.
// Ref: https://www.tampermonkey.net/documentation.php?locale=en#api
declare function GM_addStyle(code: string): HTMLStyleElement;
declare function GM_getValue<T>(key: string, defaultValue: T): T;
declare function GM_getValues<T extends Record<string, any>>(values: T): T;
declare function GM_setValue<T>(key: string, value: T): void;
declare function GM_setValues<T extends Record<string, any>>(values: T): void;
declare function GM_deleteValue(key: string): void;
declare function GM_deleteValues(keys: string[]): void;
declare function GM_listValues(): string[];
declare function GM_addValueChangeListener<T>(
	name: string,
	callback: (
		name: string,
		oldValue: T | undefined,
		newValue: T | undefined,
		remote: boolean,
	) => void,
): number;
declare function GM_removeValueChangeListener(listenerId: number): void;
