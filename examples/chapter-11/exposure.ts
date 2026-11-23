export type Exposure = "direct" | "deferred" | "codemode" | "hidden";
export type Tool = { name: string; description: string; exposure: Exposure };
export type InitialTools = (tools: readonly Tool[]) => string[];
export type LoadMatches = (tools: readonly Tool[], active: readonly string[], query: string) => string[];

// #region exposure
export const initialTools: InitialTools = (tools) => {
	const active = tools.filter(({ exposure }) => exposure === "direct").map(({ name }) => name);
	if (tools.some(({ exposure }) => exposure === "deferred")) active.push("tool_search");
	if (tools.some(({ exposure }) => exposure === "codemode")) active.push("codemode");
	return active;
};

export const loadMatches: LoadMatches = (tools, active, query) => {
	const needle = query.trim().toLowerCase();
	if (needle === "") return [...active];
	const matches = tools.filter(({ exposure, name, description }) =>
		(exposure === "deferred" || exposure === "codemode") &&
		!active.includes(name) &&
		`${name} ${description}`.toLowerCase().includes(needle),
	);
	return [...active, ...matches.map(({ name }) => name)];
};
// #endregion exposure
