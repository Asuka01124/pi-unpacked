import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	pi.on("tool_call", (event) => {
		if (event.toolName === "mcp__ci__get_failed_test") {
			return { block: true, reason: "本次练习禁止查询 CI 任务。" };
		}
	});
}
