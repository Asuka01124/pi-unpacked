import { runAgent, type Message } from "../agent-loop.ts";
import * as reference from "./resources.ts";
import type { FormatSkillCatalog, Skill, SubstituteArgs } from "./resources.ts";

export const scenarios = [
	{ id: "agents", label: "AGENTS.md" },
	{ id: "skill", label: "模型发现 Skill" },
	{ id: "skill-command", label: "手动调用 Skill" },
	{ id: "template", label: "提示词模板" },
] as const;
export type Scenario = typeof scenarios[number]["id"];

const layout = {
	agents: "AGENTS.md",
	skill: ".pi/skills/login-triage/SKILL.md",
	template: ".pi/prompts/triage.md",
};
const procedures = "先定位第一个 HTTP 401。核对它前一条请求是否携带凭据。最后分开列出已知现象和待验证原因。";
const skill: Skill = { name: "login-triage", description: "排查登录测试失败时使用。", location: `/workspace/${layout.skill}` };
const skillBody = `# 登录排障\n\n${procedures}`;
const question = "请帮我排查 test.log 里的登录测试失败。";
const templateBody = `排查 $1 里的$2。\n\n${procedures}`;
const systemBase = "你是编码助手。";
const skillFile = `---\nname: ${skill.name}\ndescription: ${skill.description}\n---\n\n${skillBody}`;

export type CapturedRequest = { system: string; tools: string[]; messages: Message[] };
type ResourceFunctions = { formatSkillCatalog: FormatSkillCatalog; substituteArgs: SubstituteArgs };

export async function captureRequests(scenario: Scenario, resources: ResourceFunctions = reference) {
	const isSkill = scenario === "skill" || scenario === "skill-command";
	const { formatSkillCatalog, substituteArgs } = resources;
	const templateArgs = ["test.log", "登录测试失败"];
	const command = isSkill ? `/skill:${skill.name} ${question}` : `/triage ${templateArgs.join(" ")}`;
	const body = scenario === "agents" ? `# 项目约定\n\n${procedures}` : isSkill ? skillBody : templateBody;
	const systemSection = scenario === "agents"
		? `<project_instructions path="/workspace/${layout.agents}">\n${body}\n</project_instructions>`
		: isSkill ? formatSkillCatalog([skill], "read") : "";
	const system = [systemBase, systemSection].filter(Boolean).join("\n\n");
	let user = question;
	if (scenario === "skill-command") {
		user = `<skill name="${skill.name}" location="${skill.location}">\n引用相对于 /workspace/.pi/skills/login-triage 解析。\n\n${skillBody}\n</skill>\n\n${question}`;
	} else if (scenario === "template") {
		user = substituteArgs(templateBody, templateArgs);
	}

	const requests: CapturedRequest[] = [];
	const tools = isSkill ? ["read"] : [];
	await runAgent(user, async (messages) => {
		requests.push({ system, tools, messages: [...messages] });
		if (scenario === "skill" && messages.length === 1 && system.includes(`<location>${skill.location}</location>`)) {
			return { role: "assistant", stopReason: "toolUse", toolCall: { id: "call_1", name: "read", arguments: { path: skill.location } } };
		}
		return { role: "assistant", stopReason: "stop", text: "已收到本轮排障指令。" };
	}, async (path) => {
		if (path !== skill.location) throw new Error("只有内置的 Skill 可读。");
		return skillFile;
	});

	const file = scenario === "agents" ? layout.agents : isSkill ? layout.skill : layout.template;
	return { file, source: isSkill ? skillFile : body, input: scenario === "skill-command" || scenario === "template" ? command : question, requests };
}
