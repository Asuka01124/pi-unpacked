import assert from "node:assert/strict";
import * as exercise from "./exercise.ts";
import * as reference from "./resources.ts";
import { captureRequests, scenarios } from "./scenario.ts";

const flags = process.argv.slice(2);
const resources = flags.includes("--exercise") ? exercise : reference;

if (flags.includes("--verify")) {
	const [agents, skill, explicit, template] = await Promise.all(scenarios.map(({ id }) => captureRequests(id, resources)));
	const procedure = /先定位第一个 HTTP 401/;
	assert.match(agents.requests[0].system, procedure);
	assert.doesNotMatch(JSON.stringify(agents.requests[0].messages), procedure);

	assert.equal(skill.requests.length, 2);
	assert.match(skill.requests[0].system, /<name>login-triage<\/name>/);
	assert.match(skill.requests[0].system, /<description>排查登录测试失败时使用。<\/description>/);
	assert.doesNotMatch(JSON.stringify(skill.requests[0]), procedure);
	const readCall = skill.requests[1].messages[1];
	const result = skill.requests[1].messages[2];
	assert.ok(readCall.role === "assistant" && readCall.stopReason === "toolUse");
	assert.ok(result.role === "toolResult" && !result.isError);
	assert.equal(result.toolCallId, readCall.toolCall.id);
	assert.match(result.content, procedure);

	assert.equal(explicit.requests.length, 1);
	assert.match(JSON.stringify(explicit.requests[0].messages), procedure);
	assert.doesNotMatch(explicit.requests[0].system, procedure);
	assert.match(JSON.stringify(template.requests[0].messages), /排查 test\.log 里的登录测试失败。/);
	assert.match(JSON.stringify(template.requests[0].messages), procedure);
	assert.doesNotMatch(template.requests[0].system, /available_skills/);

	const metadata = { name: "manual", description: "手动 & 检查", location: "/workspace/SKILL.md" };
	assert.equal(resources.formatSkillCatalog([metadata]), "");
	assert.equal(resources.formatSkillCatalog([{ ...metadata, disableModelInvocation: true }], "read"), "");
	const bashCatalog = resources.formatSkillCatalog([metadata], "bash");
	assert.match(bashCatalog, /bash/);
	assert.match(bashCatalog, /手动 &amp; 检查/);
	assert.equal(resources.substituteArgs("$1 / $2 / $@", ["$2"]), "$2 /  / $2");
	console.log("通过第五章验收：项目指令、自动和手动 Skill、模板展开及正文进入请求的时机。");
} else {
	const scenario = scenarios.find(({ id }) => flags.includes(id));
	if (!scenario) throw new Error("请选择 agents、skill、skill-command、template 或 --verify。");
	console.log(JSON.stringify(await captureRequests(scenario.id, resources), null, 2));
}
