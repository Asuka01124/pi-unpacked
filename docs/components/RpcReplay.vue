<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import { createClient } from "../../examples/chapter-13/client.ts";
import { createReader, encode, READ_TASK, STEER_MESSAGE, TEST_TASK, type Command, type CommandInput, type Record } from "../../examples/chapter-13/protocol.ts";
import { createSession } from "../../examples/chapter-13/session.ts";

const busy = ref(false);
const status = ref("还未发送命令。");
const evidence = ref("");
const commands = ref<{ direction: string; message: Command | Record }[]>([]);
const lastTool = ref("");
const settled = ref(false);

const session = createSession((message) => {
	commands.value.push({ direction: "Pi → 客户端", message });
	client.push(encode(message));
}, 4500, 6000);
const host = createReader((line) => session.receive(JSON.parse(line) as Command));
const client = createClient((chunk, message) => {
	commands.value.push({ direction: "客户端 → Pi", message });
	host.push(chunk);
}, (event) => {
	switch (event.type) {
		case "tool_execution_start":
			lastTool.value = event.toolName;
			status.value = `${event.toolName} 执行中`;
			break;
		case "message_end":
			if (event.message.role === "assistant") evidence.value = event.message.content;
			break;
		case "agent_settled":
			busy.value = false;
			settled.value = true;
			status.value = event.aborted ? "运行已取消" : "运行已结束";
			break;
	}
});

async function send(command: CommandInput) {
	if (command.type === "prompt") {
		commands.value = [];
		settled.value = false;
		evidence.value = "";
		lastTool.value = "";
		busy.value = true;
	}
	try {
		await client.send(command);
		if (command.type === "steer" && busy.value) status.value = `引导已排队，${lastTool.value} 仍在执行`;
	} catch (error) {
		if (command.type === "prompt") busy.value = false;
		status.value = error instanceof Error ? error.message : String(error);
	}
}

onBeforeUnmount(() => {
	session.dispose();
	client.close();
});
</script>

<template>
	<section class="chapter-lab" aria-label="Pi RPC 客户端回放">
		<fieldset class="lab-fieldset">
			<legend>向会话发送命令</legend>
			<div class="lab-options">
				<button class="lab-button lab-button-primary" type="button" :disabled="busy" @click="send({ type: 'prompt', message: READ_TASK })">开始读日志</button>
				<button class="lab-button" type="button" :disabled="busy" @click="send({ type: 'prompt', message: TEST_TASK })">开始模拟测试</button>
				<button class="lab-button" type="button" :disabled="!busy" @click="send({ type: 'steer', message: STEER_MESSAGE })">只报告状态码</button>
				<button class="lab-button" type="button" :disabled="!busy" @click="send({ type: 'abort' })">取消运行</button>
			</div>
		</fieldset>
		<div class="lab-body" role="status">
			<p class="lab-title">{{ status }}</p>
			<p v-if="evidence">{{ evidence }}</p>
			<p v-if="settled" class="lab-label">已收到 <code>agent_settled</code>，可以开始下一次运行。</p>
		</div>
		<details v-if="commands.length">
			<summary>查看双向 JSONL 记录</summary>
			<pre tabindex="0" aria-label="命令、应答和事件"><code>{{ commands.map(({ direction, message }) => direction + "\n" + JSON.stringify(message)).join("\n\n") }}</code></pre>
		</details>
	</section>
</template>
