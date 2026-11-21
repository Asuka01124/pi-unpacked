<script setup lang="ts">
import { computed, ref } from "vue";
import { cases, contextWindow, replayCompaction, reserveTokens, type Case } from "../../examples/chapter-9/scenario.ts";

const selected = ref<Case>("roomy");
const trace = computed(() => replayCompaction(selected.value));
</script>

<template>
	<section class="chapter-lab" aria-label="上下文压缩回放">
		<fieldset class="lab-fieldset">
			<legend>切换日志和保留预算</legend>
			<div class="lab-options">
				<button v-for="item in cases" :key="item.id" class="lab-button" type="button" :aria-pressed="selected === item.id" @click="selected = item.id">
					{{ item.label }}
				</button>
			</div>
		</fieldset>
		<div class="lab-body" role="status">
			<p class="lab-title">
				{{ trace.compaction ? "已压缩" : "未触发压缩" }} · 估算 {{ trace.tokensBefore }}
				<template v-if="trace.compaction"> → {{ trace.tokensAfter }}</template> token
			</p>
			<p class="lab-label">触发阈值 {{ contextWindow - reserveTokens }} · 近期保留预算 {{ trace.keepRecentTokens }}</p>
			<p v-if="trace.compaction">
				原文从 <code>{{ trace.compaction.firstKeptEntryId }}</code> 开始保留。
				<template v-if="trace.plan?.turnPrefix.length">本次调查的前半段进入前情摘要。</template>
			</p>
			<p>{{ trace.answer }}</p>
		</div>
		<details v-if="trace.compaction">
			<summary>查看压缩条目和切点</summary>
			<pre tabindex="0" aria-label="压缩条目和切点"><code>{{ JSON.stringify({ entry: trace.compaction, turnPrefix: trace.plan?.turnPrefix.map(({ id }) => id) }, null, 2) }}</code></pre>
		</details>
		<details>
			<summary>查看下一次模型请求</summary>
			<pre tabindex="0" aria-label="下次请求的上下文"><code>{{ JSON.stringify(trace.nextRequest, null, 2) }}</code></pre>
		</details>
		<details>
			<summary>查看会话保留的原始记录</summary>
			<pre tabindex="0" aria-label="原始会话路径"><code>{{ JSON.stringify(trace.stored, null, 2) }}</code></pre>
		</details>
	</section>
</template>
