import van, { type ChildDom, type PropValueOrDerived } from "vanjs-core";
import nameMap from "../style.module.scss";

const { label, input, span } = van.tags;

type TextFieldLabel = {
	// TODO: icon / prefix / suffix
	label: string;
	input?: ChildDom;
};

export const TextField = (
	_label: TextFieldLabel,
	prop?: Record<string, PropValueOrDerived>,
) => {
	return label(
		{ ...prop, class: [nameMap.text_field, prop?.class ?? ""].join(" ") },
		_label.input ?? input({ placeholder: " " }),
		span(_label.label),
	);
};
