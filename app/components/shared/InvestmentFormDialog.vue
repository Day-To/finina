<script setup>
// Add / Edit a holding (mutual fund or stock). VeeValidate + investmentInputSchema.
// kind is fixed by the page; bucket/category/sub-category/platform use the
// creatable BucketCombobox. Per-fund share within a bucket is set in the flow editor.
import { ref, computed, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { toast } from 'vue-sonner'
import { investmentInputSchema } from '@/domain/schemas.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  kind: { type: String, default: 'mutualFund' }, // 'mutualFund' | 'stock'
  investment: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'saved'])

const inv = useInvestments()
const isEdit = computed(() => !!props.investment?.id)
const isMf = computed(() => props.kind === 'mutualFund')
const saving = ref(false)

const dialogOpen = computed({ get: () => props.open, set: (v) => emit('update:open', v) })

const CATEGORY_PRESETS = computed(() => (isMf.value ? ['Debt', 'Equity', 'Hybrid', 'Commodities'] : ['Small Case', 'US Stock', 'ETF']))
const SUBCAT_PRESETS = ['Liquid', 'Medium Duration', 'Large & MidCap', 'Flexi Cap', 'Mid Cap', 'Small Cap', 'ELSS', 'Multi Asset Allocation', 'Sectoral', 'Gold']
const PLATFORM_PRESETS = ['Groww', 'TickerTape', 'Zerodha', 'Kuvera']
const bucketOptions = computed(() => inv.bucketNamesFor(props.kind))

const empty = () => ({ kind: props.kind, name: '', bucket: '', category: '', subCategory: '', platform: '', active: true })
const { handleSubmit, resetForm, isSubmitting } = useForm({
  validationSchema: toTypedSchema(investmentInputSchema),
  initialValues: empty(),
})

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  const a = props.investment
  resetForm({
    values: a
      ? { kind: props.kind, name: a.name ?? '', bucket: a.bucket ?? '', category: a.category ?? '', subCategory: a.subCategory ?? '', platform: a.platform ?? '', active: a.active !== false }
      : empty(),
  })
})

const onSubmit = handleSubmit(async (v) => {
  saving.value = true
  try {
    const payload = { ...v, kind: props.kind, bucket: v.bucket || '' }
    if (isEdit.value) { await inv.update(props.investment.id, payload); toast.success(isMf.value ? 'Fund updated' : 'Stock updated') }
    else { await inv.create(payload); toast.success(isMf.value ? 'Fund added' : 'Stock added') }
    emit('saved')
    emit('update:open', false)
  }
  catch { toast.error('Could not save') }
  finally { saving.value = false }
})
</script>

<template>
  <UiDialog v-model:open="dialogOpen">
    <UiDialogContent class="sm:max-w-lg">
      <UiDialogHeader>
        <UiDialogTitle>{{ isEdit ? 'Edit' : 'Add' }} {{ isMf ? 'fund' : 'stock' }}</UiDialogTitle>
        <UiDialogDescription>{{ isMf ? 'A mutual fund' : 'A stock' }} in a bucket. Set how much each fund gets in the Investments flow.</UiDialogDescription>
      </UiDialogHeader>

      <form id="investment-form" class="space-y-4" novalidate @submit="onSubmit">
        <UiFormField v-slot="{ componentField }" name="name">
          <UiFormItem>
            <UiFormLabel>Name *</UiFormLabel>
            <UiFormControl><UiInput v-bind="componentField" :placeholder="isMf ? 'e.g. Parag Parikh Flexi Cap' : 'e.g. NIFTY BEES'" /></UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ value, handleChange }" name="bucket">
          <UiFormItem>
            <UiFormLabel>Bucket <span class="text-muted-foreground">(goal/group)</span></UiFormLabel>
            <UiFormControl>
              <BucketCombobox :model-value="value || ''" :options="bucketOptions" placeholder="e.g. long term" @update:model-value="handleChange" />
            </UiFormControl>
            <p class="text-xs text-muted-foreground">Bucket is a default grouping. Set each fund's share in the flow editor.</p>
            <UiFormMessage />
          </UiFormItem>
        </UiFormField>

        <div class="grid grid-cols-2 gap-3">
          <UiFormField v-slot="{ value, handleChange }" name="category">
            <UiFormItem>
              <UiFormLabel>Category</UiFormLabel>
              <UiFormControl>
                <BucketCombobox :model-value="value || ''" :options="CATEGORY_PRESETS" placeholder="Category" @update:model-value="handleChange" />
              </UiFormControl>
              <UiFormMessage />
            </UiFormItem>
          </UiFormField>

          <UiFormField v-if="isMf" v-slot="{ value, handleChange }" name="subCategory">
            <UiFormItem>
              <UiFormLabel>Sub-category</UiFormLabel>
              <UiFormControl>
                <BucketCombobox :model-value="value || ''" :options="SUBCAT_PRESETS" placeholder="Sub-category" @update:model-value="handleChange" />
              </UiFormControl>
              <UiFormMessage />
            </UiFormItem>
          </UiFormField>

          <UiFormField v-else v-slot="{ value, handleChange }" name="platform">
            <UiFormItem>
              <UiFormLabel>Platform</UiFormLabel>
              <UiFormControl>
                <BucketCombobox :model-value="value || ''" :options="PLATFORM_PRESETS" placeholder="Platform" @update:model-value="handleChange" />
              </UiFormControl>
              <UiFormMessage />
            </UiFormItem>
          </UiFormField>
        </div>

        <UiFormField v-slot="{ value, handleChange }" name="active">
          <UiFormItem>
            <UiFormLabel>Active</UiFormLabel>
            <UiFormControl>
              <div class="flex h-9 items-center gap-2">
                <UiSwitch :model-value="value" @update:model-value="handleChange" />
                <span class="text-sm text-muted-foreground">{{ value ? 'Receiving funds' : 'Paused' }}</span>
              </div>
            </UiFormControl>
          </UiFormItem>
        </UiFormField>
      </form>

      <UiDialogFooter>
        <UiButton type="button" variant="ghost" :disabled="saving" @click="emit('update:open', false)">Cancel</UiButton>
        <UiButton type="button" :disabled="saving || isSubmitting" @click="onSubmit">{{ saving ? 'Saving…' : 'Save' }}</UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
