<script setup lang="ts">
import { computed, ref } from "vue";
import { replayTriage } from "../../examples/chapter-6/scenario.ts";

const steps = replayTriage();
const position = ref(0);
const step = computed(() => steps[position.value]);
</script>

<template>
	<section class="extension-replay" aria-label="调查扩展回放">
		<label>查看步骤
			<select v-model.number="position">
				<option v-for="(item, index) in steps" :key="item.label" :value="index">{{ item.label }}</option>
			</select>
		</label>
		<p class="description" role="status">{{ step.description }}</p>
		<pre tabindex="0" :aria-label="`${step.label}数据`"><code>{{ JSON.stringify(step.data, null, 2) }}</code></pre>
		<div class="actions">
			<button type="button" :disabled="position === 0" @click="position--">上一步</button>
			<button type="button" @click="position = position === steps.length - 1 ? 0 : position + 1">
				{{ position === steps.length - 1 ? "回到开头" : "下一步" }}
			</button>
		</div>
	</section>
</template>

<style scoped>
.extension-replay { margin: 20px 0 32px; padding: 16px; border: 1px solid var(--vp-c-divider); border-radius: 16px; }
.extension-replay label { display: grid; gap: 4px; width: fit-content; max-width: 100%; font-size: 14px; font-weight: 600; }
.extension-replay select, .extension-replay button {
	min-height: 44px;
	max-width: 100%;
	padding: 0 12px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-c-bg);
	color: var(--vp-c-text-1);
	cursor: pointer;
}
.extension-replay button:disabled { opacity: .55; cursor: default; }
.extension-replay button:not(:disabled):hover { background: var(--vp-c-brand-soft); }
.extension-replay .description { margin: 12px 0 8px; font-size: 14px; }
.extension-replay pre {
	max-height: 20rem;
	margin: 0;
	padding: 12px;
	border-radius: 10px;
	background: var(--vp-code-block-bg);
	overflow: auto;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.extension-replay pre code { padding: 0; color: inherit; background: transparent; font-size: 13px; }
.actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
</style>
