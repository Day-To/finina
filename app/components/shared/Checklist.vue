<script setup>
// Month / plan to-do checklist (§9). Auto-generated items are badged. Supports
// toggling done, adding manual items, and deleting.
import { ref, computed, watch } from 'vue'
import { PlusIcon, Trash2Icon, SparklesIcon } from '@lucide/vue'
import { newId } from '@/domain/ids.js'

const props = defineProps({
  modelValue: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  allowAdd: { type: Boolean, default: true },
  addPlaceholder: { type: String, default: 'Add a to-do…' },
})
const emit = defineEmits(['update:modelValue'])

const clone = (v) => JSON.parse(JSON.stringify(v ?? []))
const rows = ref(clone(props.modelValue))
watch(
  () => props.modelValue,
  (v) => {
    if (JSON.stringify(v ?? []) !== JSON.stringify(rows.value)) rows.value = clone(v)
  },
)
function commit() {
  rows.value.forEach((r, i) => { r.order = i })
  emit('update:modelValue', clone(rows.value))
}

const draft = ref('')
const remaining = computed(() => rows.value.filter((r) => !r.isDone).length)

function toggle(id, val) {
  const r = rows.value.find((x) => x.id === id)
  if (r) { r.isDone = !!val; commit() }
}
function add() {
  const label = draft.value.trim()
  if (!label) return
  rows.value.push({ id: newId(), label, isDone: false, isAuto: false, order: rows.value.length })
  draft.value = ''
  commit()
}
function remove(id) {
  rows.value = rows.value.filter((x) => x.id !== id)
  commit()
}
</script>

<template>
  <div class="space-y-2">
    <ul v-if="rows.length" class="space-y-1">
      <li
        v-for="row in rows"
        :key="row.id"
        class="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
      >
        <UiCheckbox
          :id="`chk-${row.id}`"
          :model-value="row.isDone"
          :disabled="disabled"
          @update:model-value="toggle(row.id, $event)"
        />
        <label
          :for="`chk-${row.id}`"
          class="min-w-0 flex-1 cursor-pointer text-sm"
          :class="row.isDone && 'text-muted-foreground line-through'"
        >
          {{ row.label }}
        </label>
        <UiBadge v-if="row.isAuto" variant="outline" class="gap-1 text-[10px]">
          <SparklesIcon class="size-3" /> Auto
        </UiBadge>
        <UiButton
          type="button"
          variant="ghost"
          size="icon"
          class="size-9 shrink-0 text-muted-foreground opacity-100 hover:text-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 sm:focus-visible:opacity-100"
          :disabled="disabled"
          :aria-label="`Delete ${row.label}`"
          @click="remove(row.id)"
        >
          <Trash2Icon class="size-3.5" />
        </UiButton>
      </li>
    </ul>
    <p v-else class="px-2 py-3 text-sm text-muted-foreground">No to-dos yet.</p>

    <form v-if="allowAdd" class="flex items-center gap-2" @submit.prevent="add">
      <UiInput v-model="draft" :placeholder="addPlaceholder" :disabled="disabled" class="flex-1" />
      <UiButton type="submit" variant="outline" size="icon" :disabled="disabled || !draft.trim()" aria-label="Add to-do">
        <PlusIcon class="size-4" />
      </UiButton>
    </form>

    <p v-if="rows.length" class="px-2 text-xs text-muted-foreground">{{ remaining }} remaining</p>
  </div>
</template>
