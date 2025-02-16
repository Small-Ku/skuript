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
