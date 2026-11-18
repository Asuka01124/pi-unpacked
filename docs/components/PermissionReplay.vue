<script setup lang="ts">
import { computed, shallowRef, ref, watch } from "vue";
import { replayWrite, scenarios, simulateReadOnly, type Scenario } from "../../examples/chapter-7/scenario.ts";

const selected = ref<Scenario>("hidden");
const trace = shallowRef<Awaited<ReturnType<typeof replayWrite>>>();
const outcome = computed(() => trace.value?.events.at(-1));

watch(selected, async (id, _previous, onCleanup) => {
	let active = true;
	onCleanup(() => { active = false; });
	const next = await replayWrite(id, () => {
		if (id === "readonly") simulateReadOnly();
	});
	if (active) trace.value = next;
}, { immediate: true });
</script>

<template>
	<section class="chapter-lab" aria-label="同一条写入在哪一步停止">
		<p class="lab-body">同一条 <code>write</code> 调用尝试写入 <code>triage-note.txt</code>。</p>
		<fieldset class="lab-fieldset">
			<legend>选择实验条件</legend>
			<div class="lab-options">
				<button v-for="item in scenarios" :key="item.id" class="lab-button" type="button" :aria-pressed="selected === item.id" @click="selected = item.id">
					{{ item.label }}
				</button>
			</div>
		</fieldset>
		<div v-if="outcome" class="lab-body" role="status">
			<p class="lab-title">{{ outcome.ok ? "写入成功（模拟）" : `停在${outcome.stage}` }}</p>
			<p>{{ outcome.ok ? "查找、校验、审批和写入都通过。" : outcome.detail }}</p>
		</div>
		<details v-if="trace">
			<summary>查看工具调用和执行记录</summary>
			<p>活动工具 <code>{{ trace.activeTools.join(", ") }}</code></p>
			<ol>
				<li v-for="event in trace.events" :key="event.stage">
					<strong>{{ event.stage }}</strong> · {{ event.ok ? "通过" : "停止" }}。{{ event.detail }}
				</li>
			</ol>
			<pre tabindex="0" aria-label="模拟模型提交的工具调用"><code>{{ JSON.stringify(trace.request, null, 2) }}</code></pre>
		</details>
	</section>
</template>
