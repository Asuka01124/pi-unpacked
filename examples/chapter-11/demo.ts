import assert from "node:assert/strict";
import * as exercise from "./exercise.ts";
import * as reference from "./exposure.ts";
import { ciTools, modes, replayDiscovery } from "./scenario.ts";

const flags = process.argv.slice(2);
const implementation = flags.includes("--exercise") ? exercise : reference;
const [direct, deferred, codemode, hidden] = await Promise.all(modes.map(({ id }) => replayDiscovery(id, implementation)));

if (flags.includes("--verify")) {
	assert.deepEqual([direct, deferred, codemode, hidden].map(({ requests }) => requests.length), [3, 4, 2, 1]);
	assert.deepEqual(direct.requests[0].tools, ciTools);
	assert.deepEqual(deferred.requests[0].tools, ["tool_search"]);
	assert.deepEqual(deferred.requests[1].tools, ["tool_search", ...ciTools]);
	assert.ok(codemode.requests.every(({ tools }) => tools.length === 1 && tools[0] === "codemode"));
	assert.deepEqual(hidden.requests[0].tools, []);
	assert.equal(hidden.calls.length, 0);
	assert.equal(direct.calls.length, 4);
	assert.deepEqual(deferred.calls, direct.calls);
	assert.deepEqual(codemode.calls.map(({ parentToolCallId, ...call }) => {
		assert.equal(parentToolCallId, "code-1");
		return call;
	}), direct.calls);
	for (const result of [direct, deferred, codemode]) {
		assert.deepEqual(result.results, [{ job: "login-tests", actualStatus: 401 }]);
	}
	assert.equal(codemode.modelVisibleResult, codemode.results);
	assert.match(JSON.stringify(direct.modelVisibleResult), /HTTP 503/);
	assert.doesNotMatch(JSON.stringify(codemode.modelVisibleResult), /503/);
	const hiddenTool = { name: "hidden_ci", description: "CI", exposure: "hidden" as const };
	const deferredTool = { name: "deferred_ci", description: "CI", exposure: "deferred" as const };
	const scriptTool = { name: "codemode_ci", description: "CI", exposure: "codemode" as const };
	const active = ["tool_search"];
	assert.deepEqual(implementation.loadMatches([hiddenTool, deferredTool, scriptTool], active, " CI "), ["tool_search", "deferred_ci", "codemode_ci"]);
	assert.deepEqual(implementation.loadMatches([deferredTool], active, " "), active);
	assert.deepEqual(active, ["tool_search"]);
	console.log("通过第十一章验收：四种暴露方式、请求中的工具声明、嵌套调用和筛选结果。");
} else {
	for (const [index, trace] of [direct, deferred, codemode, hidden].entries()) {
		console.log(modes[index].label, JSON.stringify(trace, null, 2));
	}
}
