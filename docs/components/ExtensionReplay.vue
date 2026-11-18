<script setup lang="ts">
import { computed, ref } from "vue";
import { replayTriage } from "../../examples/chapter-6/scenario.ts";

const steps = replayTriage();
const position = ref(0);
const step = computed(() => steps[position.value]);
</script>

<template>
	<section class="chapter-lab" aria-label="调查扩展回放">
		<div class="lab-body" role="status">
			<p class="lab-title">{{ step.label }}</p>
			<p>{{ step.description }}</p>
			<p v-if="step.data.activeTools"><code>activeTools</code> <code>{{ step.data.activeTools.join(', ') }}</code></p>
		</div>
		<div class="lab-options lab-body">
			<button class="lab-button" type="button" :disabled="position === 0" @click="position--">上一步</button>
			<button class="lab-button lab-button-primary" type="button" @click="position = position === steps.length - 1 ? 0 : position + 1">
				{{ position === steps.length - 1 ? "回到开头" : "下一步" }}
			</button>
			<span class="lab-label">{{ position + 1 }} / {{ steps.length }}</span>
		</div>
		<details>
			<summary>查看步骤和 JSON</summary>
			<div class="lab-options" role="group" aria-label="跳到扩展步骤">
				<button
					v-for="(item, index) in steps"
					:key="item.label"
					class="lab-button"
					type="button"
					:aria-current="position === index ? 'step' : undefined"
					@click="position = index"
				>{{ item.label }}</button>
			</div>
			<pre tabindex="0" :aria-label="`${step.label}数据`"><code>{{ JSON.stringify(step.data, null, 2) }}</code></pre>
		</details>
	</section>
</template>
