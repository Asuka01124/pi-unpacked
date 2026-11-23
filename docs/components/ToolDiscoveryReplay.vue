<script setup lang="ts">
import { ref, shallowRef, watch } from "vue";
import { modes, replayDiscovery } from "../../examples/chapter-11/scenario.ts";
import type { Exposure } from "../../examples/chapter-11/exposure.ts";

const mode = ref<Exposure>("direct");
const trace = shallowRef<Awaited<ReturnType<typeof replayDiscovery>>>();

watch(mode, async (selected, _previous, onCleanup) => {
	let active = true;
	onCleanup(() => { active = false; });
	const next = await replayDiscovery(selected);
	if (active) trace.value = next;
}, { immediate: true });
</script>

<template>
	<section class="chapter-lab" aria-label="工具暴露与 Code Mode 回放">
		<fieldset class="lab-fieldset">
			<legend>选择 CI 工具的暴露方式</legend>
			<div class="lab-options">
				<button v-for="item in modes" :key="item.id" class="lab-button" type="button" :aria-pressed="mode === item.id" @click="mode = item.id">
					{{ item.label }}
				</button>
			</div>
		</fieldset>
		<template v-if="trace">
			<div class="lab-body" role="status">
				<p class="lab-title">{{ trace.requests.length }} 次模型请求 · {{ trace.calls.length }} 次 CI 工具调用</p>
				<p>首个请求声明 <code>{{ trace.requests[0].tools.join(", ") || "无 CI 工具" }}</code></p>
				<p v-if="trace.results.length">筛选结果 <code>{{ trace.results[0].job }} · HTTP {{ trace.results[0].actualStatus }}</code></p>
			</div>
			<details>
				<summary>查看每次请求声明的工具</summary>
				<ol>
					<li v-for="(request, index) in trace.requests" :key="index">
						{{ request.action }} <code>{{ request.tools.join(", ") || "无 CI 工具" }}</code>
					</li>
				</ol>
			</details>
			<details>
				<summary>查看实际调用和交回模型的结果</summary>
				<pre tabindex="0" aria-label="CI 调用和模型可见结果"><code>{{ JSON.stringify({ calls: trace.calls, modelVisibleResult: trace.modelVisibleResult }, null, 2) }}</code></pre>
			</details>
		</template>
	</section>
</template>
