import type { FormatSkillCatalog, SubstituteArgs } from "./resources.ts";

export const formatSkillCatalog: FormatSkillCatalog = (_skills, _reader) => {
	throw new Error("请先实现 formatSkillCatalog。");
};

export const substituteArgs: SubstituteArgs = (_template, _args) => {
	throw new Error("请先实现 substituteArgs。");
};
