// Fix the TypeScript error
// "Cannot find module './logo.svg' or its corresponding type declarations."
declare module "*.html" {
  const content: string;
  export default content;
}

declare module "*.scss" {
  const content: string;
  export default content;
}

declare module "*.module.css" {
	/**
	 * Generated CSS for CSS modules
	 */
	export const code: string;
	/**
	 * Exported classes
	 */
	const classMap: {
		[key: string]: string;
	};
	export default classMap;
}

declare module "*.css" {
	/**
	 * Generated CSS
	 */
	const css: string;
	export default css;
}

// Declare needed GM APIs.
// Ref: https://www.tampermonkey.net/documentation.php?locale=en#api
declare function GM_addStyle(code: string): HTMLStyleElement;
