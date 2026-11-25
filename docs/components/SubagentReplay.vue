<script setup lang="ts">
import { computed, ref } from "vue";
import { cases, replay, summarize, taskLabels, type Case } from "../../examples/chapter-12/scenario.ts";

const mode = ref<Case>("success");
const children = computed(() => replay(mode.value));
const result = computed(() => summarize(children.value));
const statuses = { completed: "已完成", failed: "启动失败", aborted: "已取消" };
</script>

<template>
	<section class="chapter-lab" aria-label="子代理委派回放">
		<fieldset class="lab-fieldset">
			<legend>选择并发调查的结果</legend>
			<div class="lab-options">
				<button v-for="item in cases" :key="item.id" class="lab-button" type="button" :aria-pressed="mode === item.id" @click="mode = item.id">
					{{ item.label }}
				</button>
			</div>
		</fieldset>
		<div class="lab-body" role="status">
			<p v-for="child in children" :key="child.task"><strong>{{ taskLabels[child.task] }}</strong> · {{ statuses[child.status] }}</p>
			<p class="lab-label">主代理收到 {{ result.evidence.length }} 条证据<template v-if="result.incomplete.length">，仍需补齐{{ taskLabels[result.incomplete[0]] }}。</template></p>
		</div>
		<details>
			<summary>查看主代理收到的证据</summary>
			<ul><li v-for="item in result.evidence" :key="item">{{ item }}</li></ul>
		</details>
		<details>
			<summary>查看子进程的 JSON 事件与退出状态</summary>
			<pre tabindex="0" aria-label="子代理输出记录"><code>{{ JSON.stringify(children, null, 2) }}</code></pre>
		</details>
	</section>
</template>
