<script setup lang="ts">
import { computed, ref } from "vue";
import { branches, encodeSession, makeSession, sharedId } from "../../examples/chapter-8/scenario.ts";
import { getBranch, projectMessages } from "../../examples/chapter-8/session.ts";

const entries = makeSession();
const leafId = ref<string>(branches[0].leafId);
const branch = computed(() => getBranch(entries, leafId.value));
const messages = computed(() => projectMessages(branch.value));
const last = computed(() => messages.value.at(-1));
</script>

<template>
	<section class="chapter-lab" aria-label="会话树与当前分支">
		<p>共同历史 <code>读取 test.log → 定位 HTTP 401</code></p>
		<div class="lab-options tree-options" role="group" aria-label="选择当前节点">
			<button class="lab-button" type="button" :aria-pressed="leafId === sharedId" @click="leafId = sharedId">
				共同起点
			</button>
			<button v-for="item in branches" :key="item.id" class="lab-button" type="button" :aria-pressed="leafId === item.leafId" @click="leafId = item.leafId">
				{{ item.label }}
			</button>
		</div>
		<div class="lab-body" role="status">
			<p class="lab-title">当前分支有 {{ messages.length }} 条上下文消息</p>
			<p v-if="last?.role === 'assistant' && last.stopReason === 'stop'">{{ last.text }}</p>
		</div>
		<details>
			<summary>查看当前路径和模型上下文</summary>
			<p><code>{{ branch.map(({ id }) => id).join(" → ") }}</code></p>
			<pre tabindex="0" aria-label="当前分支的模型消息"><code>{{ JSON.stringify(messages, null, 2) }}</code></pre>
		</details>
		<details>
			<summary>查看完整会话 JSONL</summary>
			<pre tabindex="0" aria-label="完整会话 JSONL"><code>{{ encodeSession(entries) }}</code></pre>
		</details>
	</section>
</template>

<style scoped>
.tree-options { margin-top: 10px; }
</style>
