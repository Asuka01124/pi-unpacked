export type Skill = {
	name: string;
	description: string;
	location: string;
	disableModelInvocation?: boolean;
};

export type SkillReader = "read" | "bash";
export type FormatSkillCatalog = (skills: readonly Skill[], reader?: SkillReader) => string;
export type SubstituteArgs = (template: string, args: readonly string[]) => string;

function escapeXml(text: string) {
	return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

// #region resources
export const formatSkillCatalog: FormatSkillCatalog = (skills, reader) => {
	if (!reader) return "";
	const visible = skills.filter((skill) => !skill.disableModelInvocation);
	if (visible.length === 0) return "";

	const entries = visible.map(({ name, description, location }) => [
		"  <skill>",
		`    <name>${escapeXml(name)}</name>`,
		`    <description>${escapeXml(description)}</description>`,
		`    <location>${escapeXml(location)}</location>`,
		"  </skill>",
	].join("\n"));
	return [`任务匹配时，用 ${reader} 读取对应的 Skill 文件。`, "<available_skills>", ...entries, "</available_skills>"].join("\n");
};

export const substituteArgs: SubstituteArgs = (template, args) => {
	return template.replace(/\$([1-9]\d*|@)/g, (_token, index: string) => {
		return index === "@" ? args.join(" ") : (args[Number(index) - 1] ?? "");
	});
};
// #endregion resources
