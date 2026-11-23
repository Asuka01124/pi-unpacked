import type { InitialTools, LoadMatches } from "./exposure.ts";

export const initialTools: InitialTools = (_tools) => {
	throw new Error("请先实现 initialTools。");
};

export const loadMatches: LoadMatches = (_tools, _active, _query) => {
	throw new Error("请先实现 loadMatches。");
};
