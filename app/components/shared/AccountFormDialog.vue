<script setup>
// Add / Edit bank account in a modal (S3). VeeValidate + the shared Zod schema.
// Bank name uses the creatable BankCombobox; account number, IFSC and tags are
// optional. Nickname is the only required field.
import { ref, computed, watch } from 'vue'
import { useForm } from 'vee-validate'
import { toTypedSchema } from '@vee-validate/zod'
import { toast } from 'vue-sonner'
import { bankAccountInputSchema } from '@/domain/schemas.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  account: { type: Object, default: null },
})
const emit = defineEmits(['update:open', 'saved'])

const accounts = useBankAccounts()
const isEdit = computed(() => !!props.account?.id)
const saving = ref(false)

const dialogOpen = computed({
  get: () => props.open,
  set: (v) => emit('update:open', v),
})

const EMPTY = { name: '', bankName: '', accountNumber: '', ifsc: '', tags: [] }
const { handleSubmit, resetForm, isSubmitting } = useForm({
  validationSchema: toTypedSchema(bankAccountInputSchema),
  initialValues: { ...EMPTY },
})

// Seed the form each time the dialog opens (add vs edit).
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return
    const a = props.account
    resetForm({
      values: a
        ? { name: a.name ?? '', bankName: a.bankName ?? '', accountNumber: a.accountNumber ?? '', ifsc: a.ifsc ?? '', tags: a.tags ?? [] }
        : { ...EMPTY },
    })
  },
)

const onSubmit = handleSubmit(async (values) => {
  saving.value = true
  try {
    if (isEdit.value) {
      await accounts.update(props.account.id, values)
      toast.success('Account updated')
    }
    else {
      await accounts.create(values)
      toast.success('Account added')
    }
    emit('saved')
    emit('update:open', false)
  }
  catch {
    toast.error('Could not save account')
  }
  finally {
    saving.value = false
  }
})
</script>

<template>
  <UiDialog v-model:open="dialogOpen">
    <UiDialogContent class="sm:max-w-lg">
      <UiDialogHeader>
        <UiDialogTitle>{{ isEdit ? 'Edit account' : 'Add account' }}</UiDialogTitle>
        <UiDialogDescription>Store the account identity. No balances are tracked.</UiDialogDescription>
      </UiDialogHeader>

      <form id="account-form" class="space-y-4" novalidate @submit="onSubmit">
        <UiFormField v-slot="{ componentField }" name="name">
          <UiFormItem>
            <UiFormLabel>Nickname *</UiFormLabel>
            <UiFormControl><UiInput v-bind="componentField" placeholder="e.g. Salary account" /></UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ value, handleChange }" name="bankName">
          <UiFormItem>
            <UiFormLabel>Bank name <span class="text-muted-foreground">(optional)</span></UiFormLabel>
            <UiFormControl>
              <BankCombobox :model-value="value || ''" @update:model-value="handleChange" />
            </UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ componentField }" name="accountNumber">
          <UiFormItem>
            <UiFormLabel>Account number <span class="text-muted-foreground">(optional)</span></UiFormLabel>
            <UiFormControl><UiInput v-bind="componentField" inputmode="numeric" placeholder="•••• 1234" /></UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ componentField }" name="ifsc">
          <UiFormItem>
            <UiFormLabel>IFSC / routing <span class="text-muted-foreground">(optional)</span></UiFormLabel>
            <UiFormControl><UiInput v-bind="componentField" class="uppercase" placeholder="HDFC0001234" /></UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </UiFormField>

        <UiFormField v-slot="{ value, handleChange }" name="tags">
          <UiFormItem>
            <UiFormLabel>Tags <span class="text-muted-foreground">(optional)</span></UiFormLabel>
            <UiFormControl>
              <TagInput :model-value="value || []" placeholder="Add a tag and press Enter" @update:model-value="handleChange" />
            </UiFormControl>
            <UiFormMessage />
          </UiFormItem>
        </UiFormField>
      </form>

      <UiDialogFooter>
        <UiButton type="button" variant="ghost" :disabled="saving" @click="emit('update:open', false)">Cancel</UiButton>
        <UiButton type="button" :disabled="saving || isSubmitting" @click="onSubmit">
          {{ saving ? 'Saving…' : 'Save' }}
        </UiButton>
      </UiDialogFooter>
    </UiDialogContent>
  </UiDialog>
</template>
