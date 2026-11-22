<script setup lang="ts">
import { computed, ref, shallowRef, watch } from "vue";
import { createServer } from "../../examples/chapter-10/protocol.ts";
import { cases, replayMcp, type Case } from "../../examples/chapter-10/scenario.ts";

const mode = ref<Case>("allow");
const trace = shallowRef<Awaited<ReturnType<typeof replayMcp>>>();
const methods = computed(() => trace.value?.messages.flatMap(({ message }) => "method" in message ? [message.method] : []));

watch(mode, async (selected, _previous, onCleanup) => {
	let active = true;
	onCleanup(() => { active = false; });
	const next = await replayMcp(selected, createServer());
	if (active) trace.value = next;
}, { immediate: true });
</script>

<template>
	<section class="chapter-lab" aria-label="MCP 协议回放">
		<fieldset class="lab-fieldset">
			<legend>选择 CI 服务的访问方式</legend>
			<div class="lab-options">
				<button v-for="item in cases" :key="item.id" class="lab-button" type="button" :aria-pressed="mode === item.id" @click="mode = item.id">
					{{ item.label }}
				</button>
			</div>
		</fieldset>
		<template v-if="trace">
			<div class="lab-body" role="status">
				<p>发现工具 <code>{{ trace.tool.name }}</code></p>
				<p v-if="trace.hook?.block" class="lab-title">执行前钩子已拒绝，未发送 tools/call。</p>
				<p v-else-if="trace.resource"><code>{{ trace.resource.uri }}</code> {{ trace.resource.text }}</p>
				<p v-else>{{ trace.result?.content[0]?.text }}</p>
				<p class="lab-label"><code>{{ methods?.join(" → ") }}</code></p>
			</div>
			<details>
				<summary>查看 JSON-RPC 消息</summary>
				<pre tabindex="0" aria-label="MCP 协议消息"><code>{{ trace.messages.map(({ direction, message }) => direction + "\n" + JSON.stringify(message, null, 2)).join("\n\n") }}</code></pre>
			</details>
			<details>
				<summary>查看 Pi 侧工具与结果</summary>
				<pre tabindex="0" aria-label="Pi 侧工具与结果"><code>{{ JSON.stringify({ tool: trace.tool, hook: trace.hook, result: trace.result, resource: trace.resource }, null, 2) }}</code></pre>
			</details>
		</template>
	</section>
</template>
