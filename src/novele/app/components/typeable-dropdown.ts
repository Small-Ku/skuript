import van, { type State } from "vanjs-core";
import { IconExpandMore } from "../../../style/icon";
import nameMap from "../styles/style.module.scss";

const { button, div, input } = van.tags;

type DropdownOption<T extends string> = {
	label: string;
	value: T;
	optionClass?: string;
};

function normalize(value: string) {
	return value.trim().toLowerCase();
}

export function TypeableDropdown<T extends string>(
	currentValue: State<T | string>,
	options: DropdownOption<T>[],
	placeholder = "Select or type...",
) {
	const open = van.state(false);
	const inputValue = van.state("");
	let inputElement: HTMLInputElement | undefined;

	const root = div({
		class: () =>
			[
				nameMap.customDropdown,
				nameMap.typeableDropdown,
				open.val ? nameMap.open : "",
			]
				.filter(Boolean)
				.join(" "),
	});

	const selectedOption = () =>
		options.find((option) => option.value === currentValue.val);

	const syncInputValue = () => {
		if (document.activeElement === inputElement) return;
		inputValue.val = selectedOption()?.label ?? currentValue.val;
	};

	const close = () => {
		open.val = false;
		syncInputValue();
	};

	const selectOption = (option: DropdownOption<T>) => {
		currentValue.val = option.value;
		inputValue.val = option.label;
		close();
	};

	let removeOutsideHandler: (() => void) | undefined;
	van.derive(() => {
		currentValue.val;
		syncInputValue();
	});

	van.derive(() => {
		if (!open.val) {
			removeOutsideHandler?.();
			removeOutsideHandler = undefined;
			return;
		}

		const handleClickOutside = (event: MouseEvent) => {
			if (!event.composedPath().includes(root)) {
				close();
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		removeOutsideHandler = () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	});

	const filteredOptions = () => {
		const query = normalize(inputValue.val);
		if (!query) return options;
		return options.filter(
			(option) =>
				normalize(option.label).includes(query) ||
				normalize(option.value).includes(query),
		);
	};

	inputElement = input({
		class: nameMap.typeableInput,
		type: "text",
		placeholder,
		value: () => inputValue.val,
		onfocus: () => {
			open.val = true;
		},
		onclick: (event) => {
			event.stopPropagation();
			open.val = true;
		},
		oninput: (event: Event) => {
			const nextValue = (event.target as HTMLInputElement).value;
			inputValue.val = nextValue;
			const nextOption = options.find(
				(option) => normalize(option.label) === normalize(nextValue),
			);
			currentValue.val = nextOption?.value ?? nextValue;
			open.val = true;
		},
		onkeydown: (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				event.stopPropagation();
				close();
				inputElement?.blur();
			}
		},
		onblur: () => {
			window.setTimeout(() => {
				if (!root.matches(":focus-within")) {
					close();
				}
			}, 0);
		},
	}) as HTMLInputElement;

	const trigger = div(
		{
			class: () =>
				[nameMap.dropdownTrigger, open.val ? nameMap.open : ""]
					.filter(Boolean)
					.join(" "),
		},
		inputElement,
		button(
			{
				type: "button",
				class: () =>
					[nameMap.dropdownIcon, open.val ? nameMap.open : ""]
						.filter(Boolean)
						.join(" "),
				tabindex: -1,
				onpointerdown: (event) => {
					event.preventDefault();
				},
				onclick: (event) => {
					event.stopPropagation();
					open.val = !open.val;
					if (open.val) {
						inputElement?.focus();
						inputElement?.select();
					}
				},
			},
			IconExpandMore(),
		),
	);

	const menu = () =>
		open.val
			? div(
					{ class: `${nameMap.dropdownMenu} ${nameMap.glass}` },
					...(filteredOptions().length
						? filteredOptions().map((option) =>
								button(
									{
										type: "button",
										class: () =>
											[
												nameMap.dropdownItem,
												option.optionClass ?? "",
												option.value === currentValue.val ? nameMap.active : "",
											]
												.filter(Boolean)
												.join(" "),
										onpointerdown: (event) => {
											event.preventDefault();
											event.stopPropagation();
											selectOption(option);
										},
										onclick: (event) => {
											event.stopPropagation();
											selectOption(option);
										},
									},
									option.label,
								),
							)
						: [div({ class: nameMap.dropdownItem }, "No matching fonts")]),
				)
			: "";

	syncInputValue();
	van.add(root, trigger, menu);
	return root;
}
