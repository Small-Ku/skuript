import van, { type PropValueOrDerived } from "vanjs-core";

const { path, svg } = van.tags("http://www.w3.org/2000/svg");

/* Material Symbols, some are compressed as functions with human observation: */

type EnumValue<T extends Record<string, number>> = T[keyof T];

export const Direction = {
	Left: 0,
	Right: 1,
	Top: 2,
	Bottom: 3,
} as const;
export type Direction = EnumValue<typeof Direction>;

export const HorizonDir = {
	Left: 0,
	Right: 1,
} as const;
export type HorizonDir = EnumValue<typeof HorizonDir>;

export const VerticalDir = {
	Top: 2,
	Bottom: 3,
} as const;
export type VerticalDir = EnumValue<typeof VerticalDir>;

const _icon = (d: string, prop?: Record<string, PropValueOrDerived>) =>
	svg(
		{ ...prop, viewBox: "0 -960 960 960", fill: "currentColor" },
		path({ d }),
	);

/*
first-page  M240-240v-480h80v480h-80Zm440 0L440-480l240-240 56 56-184 184 184 184-56 56Z
chevron-left                       M560-240 320-480l240-240 56 56-184 184 184 184-56 56Z
chevron-right                      M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z
last-page                          m280-240-56-56 184-184-184-184 56-56 240 240-240 240Zm360 0v-480h80v480h-80Z
*/

const leftArrowArr = [
	-240, -240, 240, -240, 56, 56, -184, 184, 184, 184, -56, 56,
];

export const IconChevron = (
	dir: HorizonDir,
	block = false,
	prop?: Record<string, PropValueOrDerived>,
) =>
	_icon(
		`M${block ? `M${dir === HorizonDir.Left ? "2" : "6"}40-240v-480h80v480h-80Zm${dir === HorizonDir.Left ? "44" : "-36"}0 0` : dir === HorizonDir.Left ? "560-240" : "376-720"}l${leftArrowArr.map((i) => i * (dir === HorizonDir.Left ? 1 : -1)).join(" ")}Z`,
		prop,
	);

/*
bottom_panel_close m480-500 160-160H320l160 160Zm280-340q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560ZM200-320v120h560v-120H200Zm560-80v-360H200v360h560Zm-560 80v120-120Z
bottom_panel_open  M320-500h320L480-660 320-500ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm0-200v120h560v-120H200Zm0-80h560v-360H200v360Zm0 80v120-120Z
left_panel_close   M660-320v-320L500-480l160 160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm120-80v-560H200v560h120Zm80 0h360v-560H400v560Zm-80 0H200h120Z
left_panel_open    M500-640v320l160-160-160-160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm120-80v-560H200v560h120Zm80 0h360v-560H400v560Zm-80 0H200h120Z
right_panel_close  M300-640v320l160-160-160-160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z
right_panel_open   M460-320v-320L300-480l160 160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm440-80h120v-560H640v560Zm-80 0v-560H200v560h360Zm80 0h120-120Z
top_panel_close    M480-460 320-300h320L480-460ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm560-520v-120H200v120h560Zm-560 80v360h560v-360H200Zm0-80v-120 120Z
top_panel_open     m480-300 160-160H320l160 160ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Zm560-520v-120H200v120h560Zm-560 80v360h560v-360H200Zm0-80v-120 120Z
*/

export const PanelState = {
	None: 0,
	Open: 1,
	Close: 2,
} as const;
export type PanelState = EnumValue<typeof PanelState>;

const innerWidth = 560;
const innerBigHeight = 360;
const innerSmallHeight = 120;

const innerRect = (
	startx: number,
	starty: number,
	width: number,
	height: number,
) => `${startx} ${starty}v${height}h${width}v${-1 * height}h${-1 * width}Z`;

const repeatedRects = (
	startx: number,
	width: number,
	height: number,
	ys: number[],
) => ys.map((y) => `M${innerRect(startx, y, width, height)}`).join("");

const barRect = (x: number, y: number, width: number) =>
	`M${innerRect(x, y, width, -80)}`;

const arrowHead = (
	x: number,
	y: number,
	startDx: number,
	startDy: number,
	span: number,
) => `M${x}${y}l${startDx} ${startDy} ${span} ${span} ${-span} ${span}Z`;

const tocDot = (y: number) =>
	`M800${y}q-17 0-28.5-11.5T760${y - 40}q0-17 11.5-28.5T800${y - 80}q17 0 28.5 11.5T840${y - 40}q0 17-11.5 28.5T800${y}Z`;

const tuneStem = (x: number, y: number) => `M${innerRect(x, y, 80, -240)}`;

const smallRect = (dir: Direction) => {
	return innerRect(
		dir === Direction.Left ? 320 : dir < Direction.Bottom ? 760 : 200,
		dir < Direction.Top ? -200 : dir === Direction.Top ? -640 : -320,
		(dir < Direction.Top ? innerSmallHeight : innerWidth) *
			(dir < Direction.Bottom ? -1 : 1),
		(dir < Direction.Top ? innerWidth : innerSmallHeight) *
			(dir < Direction.Bottom ? -1 : 1),
	);
};

const bigRect = (dir: Direction) => {
	return innerRect(
		[80, -200, -innerWidth, innerWidth][dir],
		[-innerWidth, 0, 80, -80][dir],
		(dir < Direction.Top ? innerBigHeight : innerWidth) *
			(dir % 2 === 0 ? 1 : -1),
		(dir < Direction.Top ? innerWidth : innerBigHeight) *
			(dir % 2 === 0 ? 1 : -1),
	);
};

const triangle = (dir: Direction, state: PanelState) => {
	if (!state) return "";
	const _abs = Math.abs((dir - (+!!(dir < Direction.Top) + 1)) * state);
	return `M${
		dir < Direction.Top
			? [
					[50, 66],
					[46, 30],
				][dir][state - 1]
			: 64 / (_abs === 2 ? 1 : 2)
	}0-${
		dir < Direction.Top
			? 64 / (_abs === 2 ? 1 : 2)
			: [
					[46, 30],
					[50, 66],
				][dir - 2][state - 1]
	}0${dir < Direction.Top ? "v" : "h"}${
		dir < Direction.Top ? (_abs === 2 ? "" : "-") : _abs === 2 ? "-" : ""
	}320l${_abs === 2 ? "" : "-"}160${_abs === 2 ? "-" : " "}160Z`;
};

export const IconPanel = (
	dir: Direction,
	state: PanelState = PanelState.None,
	prop?: Record<string, PropValueOrDerived>,
) =>
	_icon(
		`${triangle(dir, state)}M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200ZM${smallRect(dir)}m${bigRect(dir)}`,
		prop,
	);

export const IconReadMore = (prop?: Record<string, PropValueOrDerived>) =>
	_icon(
		[
			"M298-262l-56-56 121-122H80v-80h283L242-642",
			arrowHead(242, -642, 56, -56, 218),
			barRect(520, -280, 360),
			barRect(520, -600, 360),
			barRect(640, -440, 240),
		].join(""),
		prop,
	);

export const IconExitToApp = (prop?: Record<string, PropValueOrDerived>) =>
	_icon(
		[
			"M200-120q-33 0-56.5-23.5T120-200v-160h80v160h560v-560H200v160h-80v-160q0-33 23.5-56.5T200-840h560q33 0 56.5 23.5T840-760v560q0 33-23.5 56.5T760-120H200Z",
			"M420-280l-56-58 102-102H120v-80h346L364-622",
			arrowHead(364, -622, 56, -58, 200),
		].join(""),
		prop,
	);

export const IconToc = (prop?: Record<string, PropValueOrDerived>) =>
	_icon(
		`${repeatedRects(120, 560, -80, [-280, -440, -600])}${[-280, -440, -600].map(tocDot).join("")}`,
		prop,
	);

export const IconComment = (prop?: Record<string, PropValueOrDerived>) =>
	_icon(
		`${repeatedRects(240, 480, -80, [-400, -520, -640])}M880-80 720-240H160q-33 0-56.5-23.5T80-320v-480q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v720ZM160-320h594l46 45v-525H160v480Zm0 0v-480 480Z`,
		prop,
	);

export const IconTune = (prop?: Record<string, PropValueOrDerived>) =>
	_icon(
		[
			tuneStem(440, -120),
			barRect(520, -200, 320),
			barRect(120, -200, 240),
			barRect(120, -440, 160),
			tuneStem(280, -360),
			barRect(440, -440, 400),
			tuneStem(600, -600),
			barRect(680, -680, 160),
			barRect(120, -680, 400),
		].join(""),
		prop,
	);

export const IconClose = (prop?: Record<string, PropValueOrDerived>) =>
	_icon(
		"M256-200 200-256l224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z",
		prop,
	);

export const IconExpandMore = (prop?: Record<string, PropValueOrDerived>) =>
	_icon("M480-360 280-560l56-56 144 144 144-144 56 56-200 200Z", prop);
