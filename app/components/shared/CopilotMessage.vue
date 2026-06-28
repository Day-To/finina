<script setup>
// One chat bubble. The assistant replies in Markdown, so render it via the safe
// renderer (HTML-escaped first, fixed tag set — see lib/markdown.js). User
// messages are plain text (whitespace preserved), never interpreted as Markdown.
import { computed } from 'vue'
import { renderMarkdown } from '@/lib/markdown.js'

const props = defineProps({
  role: { type: String, default: 'assistant' },
  content: { type: String, default: '' },
  status: { type: String, default: 'complete' },
})

const isUser = computed(() => props.role === 'user')
const rendered = computed(() => renderMarkdown(props.content))
</script>

<template>
  <div :class="['flex', isUser ? 'justify-end' : 'justify-start']">
    <div
      :class="[
        'break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
        isUser
          ? 'max-w-[85%] whitespace-pre-wrap rounded-br-sm bg-primary text-primary-foreground'
          : 'max-w-[92%] rounded-bl-sm bg-muted text-foreground',
        status === 'error' ? 'border border-negative/40' : '',
      ]"
    >
      <template v-if="isUser">{{ content }}</template>
      <div v-else class="space-y-2 [&_a]:text-primary [&_strong]:font-semibold" v-html="rendered" />
    </div>
  </div>
</template>
