<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { runAgent, type Step } from "../../examples/agent-loop.ts";
import { createFakeModel, QUESTION, type Scenario } from "../../examples/fake-model.ts";
import fixture from "../../examples/test.log?raw";

const scenarios = [
	{ id: "direct", label: "直接回答" },
	{ id: "success", label: "读取成功" },
	{ id: "missing", label: "文件不存在" },
	{ id: "truncated", label: "参数截断" },
] as const;

const selected = ref<Scenario>("success");
const index = ref(0);
const traces = ref<Partial<Record<Scenario, Step[]>>>({});
const loadError = ref("");
const steps = computed(() => traces.value[selected.value] ?? []);
const detail = computed(() => {
	const step = steps.value[index.value];
	if (!step) return undefined;
	switch (step.kind) {
		case "request":
			return {
				title: `第 ${step.turn} 次请求模型`,
				summary: `把 ${step.messages.length} 条消息发给模型。`,
				label: "传给假模型的消息（实验格式）",
				data: step.messages,
			};
		case "response":
			return {
				title: step.message.stopReason === "stop" ? "模型给出最终回答" : step.message.stopReason === "length" ? "模型输出达到长度上限" : "模型请求调用工具",
				summary: step.message.stopReason === "stop" ? step.message.text : `调用 ${step.message.toolCall.name} 读取 ${step.message.toolCall.arguments.path}。`,
				label: "模型返回的消息",
				data: step.message,
			};
		case "tool":
			return { title: "程序执行读取", summary: `读取 ${step.call.arguments.path}。`, label: "交给工具的参数", data: step.call.arguments };
		case "result":
			return { title: "程序追加工具结果", summary: step.message.content.trim(), label: "写入消息列表的结果", data: step.message };
	}
});

function stepLabel(step: Step): string {
	switch (step.kind) {
		case "request":
			return `请求模型 ${step.turn}`;
		case "response":
			if (step.message.stopReason === "length") return "参数截断";
			return step.message.stopReason === "stop" ? "最终回答" : "工具请求";
		case "tool":
			return "执行读取";
		case "result":
			return "工具结果";
	}
}

onMounted(async () => {
	try {
		for (const { id } of scenarios) {
			const recorded: Step[] = [];
			await runAgent(
				QUESTION,
				createFakeModel(id),
				async (path) => {
					if (path === "test.log") return fixture;
					throw new Error(`找不到文件 ${path}。`);
				},
				(step) => recorded.push(step),
			);
			traces.value[id] = recorded;
		}
	} catch (error) {
		loadError.value = error instanceof Error ? error.message : String(error);
	}
});
</script>

<template>
	<section class="chapter-lab" aria-label="工具调用回放">
		<fieldset class="lab-fieldset">
			<legend>实验场景</legend>
			<div class="lab-options">
				<button
					v-for="scenario in scenarios"
					:key="scenario.id"
					class="lab-button"
					type="button"
					:aria-pressed="selected === scenario.id"
					:disabled="!traces[scenario.id]"
					@click="selected = scenario.id; index = 0"
				>{{ scenario.label }}</button>
			</div>
		</fieldset>
		<template v-if="detail">
			<div class="lab-body" role="status">
				<p class="lab-title">{{ detail.title }}</p>
				<p>{{ detail.summary }}</p>
				<p class="lab-label">
					模型请求 {{ steps.slice(0, index + 1).filter(step => step.kind === 'request').length }} 次，
					读取尝试 {{ steps.slice(0, index + 1).filter(step => step.kind === 'tool').length }} 次。
				</p>
			</div>
			<div class="lab-options lab-body">
				<button type="button" class="lab-button" :disabled="index === 0" @click="index--">上一步</button>
				<button type="button" class="lab-button lab-button-primary" @click="index = index < steps.length - 1 ? index + 1 : 0">
					{{ index < steps.length - 1 ? "下一步" : "重新播放" }}
				</button>
				<span class="lab-label">{{ index + 1 }} / {{ steps.length }}</span>
			</div>
			<details>
				<summary>查看执行步骤和 JSON</summary>
				<div class="lab-options" role="group" aria-label="跳到执行步骤">
					<button
						v-for="(step, position) in steps"
						:key="position"
						class="lab-button"
						type="button"
						:aria-current="index === position ? 'step' : undefined"
						@click="index = position"
					>{{ stepLabel(step) }}</button>
				</div>
				<div class="lab-body">
					<p class="lab-label">{{ detail.label }}</p>
					<pre tabindex="0" :aria-label="detail.label"><code>{{ JSON.stringify(detail.data, null, 2) }}</code></pre>
				</div>
			</details>
		</template>
		<p v-else class="lab-body" role="status">{{ loadError || "正在生成执行记录…" }}</p>
	</section>
</template>
