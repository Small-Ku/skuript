import van, { type State } from "vanjs-core";
import { IconExpandMore } from "../../../style/icon";
import nameMap from "../style.module.scss";

const { button, div, span } = van.tags;

type DropdownOption<T extends string> = {
	label: string;
	value: T;
	className?: string;
};

export function CustomDropdown<T extends string>(
	currentValue: State<T>,
	options: DropdownOption<T>[],
	size: "sm" | "md" = "md",
) {
	const open = van.state(false);
	const root = div({
		class: () =>
			[
				nameMap.customDropdown,
				size === "sm" ? nameMap.customDropdownSm : "",
			]
				.filter(Boolean)
				.join(" "),
	});

	const selectedLabel = () =>
		options.find((option) => option.value === currentValue.val)?.label ?? "Select...";

	const close = () => {
		open.val = false;
	};

	const selectOption = (option: DropdownOption<T>) => {
		currentValue.val = option.value;
		close();
	};

	let removeOutsideHandler: (() => void) | undefined;
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

	const trigger = button(
		{
			type: "button",
			class: () =>
				[nameMap.dropdownTrigger, open.val ? nameMap.open : ""]
					.filter(Boolean)
					.join(" "),
			onclick: (event) => {
				event.stopPropagation();
				open.val = !open.val;
			},
		},
		span(selectedLabel),
		div(
			{
				class: () =>
					[nameMap.dropdownIcon, open.val ? nameMap.open : ""]
						.filter(Boolean)
						.join(" "),
			},
			IconExpandMore(),
		),
	);

	const menu = () =>
		open.val
			? div(
					{ class: `${nameMap.dropdownMenu} ${nameMap.glass}` },
					...options.map((option) =>
						button(
							{
								type: "button",
								class: () =>
									[
										nameMap.dropdownItem,
										option.className ?? "",
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
					),
				)
			: "";

	van.add(root, trigger, menu);
	return root;
}
