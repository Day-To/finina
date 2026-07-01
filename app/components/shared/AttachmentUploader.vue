<script setup>
import { ref } from 'vue'
import { toast } from 'vue-sonner'
import { Trash2Icon, FileIcon, UploadIcon } from '@lucide/vue'
import { MAX_ATTACHMENT_BYTES, ALLOWED_ATTACHMENT_TYPES } from '@/domain/attachments.js' // ROUND-4: limits from pure domain
const props = defineProps({ modelValue: { type: Array, default: () => [] }, alertId: { type: String, required: true } })
const emit = defineEmits(['update:modelValue'])
const alerts = useAlerts() // ROUND-4: upload via composable, not the repo directly (layering)
const fileInput = ref(null)
const progress = ref(0)
const busy = ref(false)

async function onFiles(e) {
  const files = [...(e.target.files || [])]
  e.target.value = ''
  for (const f of files) {
    if (f.size >= MAX_ATTACHMENT_BYTES) { toast.error(`${f.name} is larger than 10 MB`); continue }
    if (!ALLOWED_ATTACHMENT_TYPES.test(f.type)) { toast.error(`${f.name}: only images and PDFs`); continue }
    busy.value = true; progress.value = 0
    try {
      const att = await alerts.uploadAttachment(props.alertId, f, (p) => { progress.value = p })
      emit('update:modelValue', [...props.modelValue, att])
    } catch (err) { toast.error(err.message || 'Upload failed') }
    finally { busy.value = false }
  }
}
function remove(att) {
  // ROUND-2 FIX B4/B5: model-only removal. Storage bytes are deleted by the parent
  // AlertFormDialog on SAVE (by diffing final vs. original+session-uploaded), and
  // discarded on CANCEL — NEVER here — so a cancelled edit can't destroy persisted bytes.
  emit('update:modelValue', props.modelValue.filter((a) => a.id !== att.id))
}
</script>

<template>
  <div class="space-y-2">
    <input ref="fileInput" type="file" multiple accept="image/*,application/pdf" class="hidden" @change="onFiles">
    <UiButton type="button" variant="outline" size="sm" class="h-8" :disabled="busy" @click="fileInput.click()">
      <UploadIcon class="size-4" /> {{ busy ? 'Uploading…' : 'Add image or file' }}
    </UiButton>
    <UiProgress v-if="busy" :model-value="Math.round(progress * 100)" class="h-1.5" />
    <ul v-if="modelValue.length" class="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <li v-for="att in modelValue" :key="att.id" class="group relative overflow-hidden rounded-md border">
        <img v-if="att.contentType.startsWith('image/')" :src="att.url" :alt="att.name" class="h-24 w-full object-cover">
        <div v-else class="flex h-24 items-center justify-center gap-2 px-2 text-xs"><FileIcon class="size-4" /><span class="truncate">{{ att.name }}</span></div>
        <UiButton type="button" variant="secondary" size="icon" class="absolute right-1 top-1 size-7 opacity-0 group-hover:opacity-100" @click="remove(att)">
          <Trash2Icon class="size-3.5" />
        </UiButton>
      </li>
    </ul>
  </div>
</template>
