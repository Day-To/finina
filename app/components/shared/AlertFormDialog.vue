<script setup>
import { ref, computed, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { toast } from 'vue-sonner'
import { alertInputSchema, RECURRENCE_NONE } from '@/domain/schemas.js'
import { firstOccurrence } from '@/domain/calc/recurrence.js' // ROUND-5: validate the rule yields a date

const props = defineProps({ open: { type: Boolean, default: false }, alert: { type: Object, default: null } })
const emit = defineEmits(['update:open', 'saved'])

const alerts = useAlerts()
const isEdit = computed(() => !!props.alert?.id)
const saving = ref(false)
const draftId = ref(null)          // pre-minted on open; targets the final Storage folder
const uploadedThisSession = ref([]) // bytes uploaded this session (both create & edit) — for cleanup (B3/B4/B5)
const originalAtt = ref([])         // attachments persisted on the doc at open (edit) — ROUND-2 B4/B5

const EMPTY = () => ({ title: '', description: '', fireAt: Date.now() + 60 * 60_000, recurrence: { ...RECURRENCE_NONE }, attachments: [], enabled: true })
const { handleSubmit, resetForm, values } = useForm({ validationSchema: toTypedSchema(alertInputSchema), initialValues: EMPTY() })

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  draftId.value = props.alert?.id || alerts.newId()
  uploadedThisSession.value = []
  originalAtt.value = props.alert?.attachments ?? []   // ROUND-2 B4/B5
  const a = props.alert
  resetForm({ values: a
    ? { title: a.title, description: a.description ?? '', fireAt: a.fireAt, recurrence: { ...RECURRENCE_NONE, ...a.recurrence }, attachments: a.attachments ?? [], enabled: a.enabled !== false }
    : EMPTY() })
})

// Track attachments uploaded this session (BOTH create & edit — ROUND-2 B4/B5) so they
// can be purged on cancel or if added-then-removed-before-save.
// ROUND-3 FIX: exclude ids already in originalAtt (set synchronously before resetForm on
// open). Otherwise resetForm's bulk-assign of a.attachments on edit-open would push the
// ORIGINALS into uploadedThisSession, and onCancel would delete their bytes on a plain
// open+cancel — a regression the round-2 change introduced.
watch(() => values.attachments, (next, prev) => {
  const prevIds = new Set((prev ?? []).map((x) => x.id))
  for (const att of next ?? []) {
    if (prevIds.has(att.id)) continue
    if (originalAtt.value.some((o) => o.id === att.id)) continue          // an original, not a new upload
    if (uploadedThisSession.value.some((u) => u.id === att.id)) continue  // already tracked
    uploadedThisSession.value.push(att)
  }
}, { deep: true })

const onSubmit = handleSubmit(async (v) => {
  // ROUND-5: reject a recurrence with no valid occurrence (e.g. Feb 31) so we never persist
  // an active alert with nextFireAt:null that would show in no group and never fire.
  if (firstOccurrence(v.recurrence, v.fireAt) == null) {
    toast.error('That repeat rule has no valid dates — adjust the day or month.')
    return
  }
  saving.value = true
  try {
    if (isEdit.value) { await alerts.update(props.alert.id, v); toast.success('Reminder updated') }
    else {
      await alerts.create(v, draftId.value)
      toast.success('Reminder set')
      // Permission prompt: FIRST reminder creation only, never on app load.
      if (!alerts.permissionAsked()) {
        const res = await alerts.requestPermission()
        if (res === 'denied' || res === 'unsupported') toast.info('Reminders will still show in the app and the notification center.')
      }
    }
    // ROUND-2 B4/B5: delete Storage bytes the saved doc no longer references — originals
    // the user removed + session uploads added-then-removed before saving.
    const finalIds = new Set((v.attachments ?? []).map((x) => x.id))
    const orphans = [...originalAtt.value, ...uploadedThisSession.value].filter((x) => x && x.path && !finalIds.has(x.id))
    if (orphans.length) {
      const seen = new Set()
      for (const att of orphans) { if (seen.has(att.path)) continue; seen.add(att.path); await alerts.deleteAttachment(att.path).catch(() => {}) }
    }
    emit('saved'); emit('update:open', false)
  } catch { toast.error('Could not save reminder') }
  finally { saving.value = false }
})

async function onCancel() {
  // ROUND-2 B4/B5: on cancel, delete ONLY bytes uploaded this session (both create & edit)
  // — the doc never referenced them. Persisted originals are left untouched, so a
  // cancelled edit that "removed" an original loses nothing (the doc is unchanged).
  if (uploadedThisSession.value.length) {
    for (const att of uploadedThisSession.value) await alerts.deleteAttachment(att.path).catch(() => {})
  }
  emit('update:open', false)
}
const dialogOpen = computed({ get: () => props.open, set: (v) => (v ? emit('update:open', true) : onCancel()) })
</script>

<template>
  <UiDialog v-model:open="dialogOpen">
    <UiDialogContent class="sm:max-w-lg max-h-[90svh] overflow-y-auto">
      <UiDialogHeader>
        <UiDialogTitle>{{ isEdit ? 'Edit reminder' : 'New reminder' }}</UiDialogTitle>
        <UiDialogDescription>Pick when, repeat if you like, and attach images or files.</UiDialogDescription>
      </UiDialogHeader>

      <form class="space-y-4" novalidate @submit="onSubmit">
        <UiFormField v-slot="{ componentField }" name="title">
          <UiFormItem><UiFormLabel>Title *</UiFormLabel>
            <UiFormControl><UiInput v-bind="componentField" placeholder="e.g. Pay credit-card bill" /></UiFormControl>
            <UiFormMessage /></UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ componentField }" name="description">
          <UiFormItem><UiFormLabel>Description <span class="text-muted-foreground">(optional)</span></UiFormLabel>
            <UiFormControl><UiTextarea v-bind="componentField" rows="2" class="resize-none" /></UiFormControl>
            <UiFormMessage /></UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ value, handleChange }" name="fireAt">
          <UiFormItem><UiFormLabel>When</UiFormLabel>
            <UiFormControl><QuickWhenPicker :model-value="value" @update:model-value="handleChange" /></UiFormControl>
            <UiFormMessage /></UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ value, handleChange }" name="recurrence">
          <UiFormItem><UiFormLabel>Repeat</UiFormLabel>
            <UiFormControl><RecurrenceEditor :model-value="value" @update:model-value="handleChange" /></UiFormControl>
            <UiFormMessage /></UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ value, handleChange }" name="attachments">
          <UiFormItem><UiFormLabel>Attachments</UiFormLabel>
            <UiFormControl><AttachmentUploader :model-value="value" :alert-id="draftId" @update:model-value="handleChange" /></UiFormControl>
            <UiFormMessage /></UiFormItem>
        </UiFormField>
      </form>

      <UiDialogFooter>
        <UiButton type="button" variant="ghost" :disabled="saving" @click="onCancel">Cancel</UiButton>
        <UiButton type="button" :disabled="saving" @click="onSubmit">{{ saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Set reminder') }}</UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
