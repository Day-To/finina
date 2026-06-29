<script setup>
// Add / edit a daily expense — a bottom sheet shared by the daily page, the home
// "Add expense" button, and the mobile bottom-bar "+". Date uses the shadcn
// Calendar; note is a textarea. Persistence is delegated via the `onSave` prop so
// each caller writes through its own repo/composable.
import { ref, reactive, computed, watch } from 'vue'
import { toast } from 'vue-sonner'
import { CalendarIcon } from '@lucide/vue'
import { parseDate } from '@internationalized/date'
import { todayISO, formatDateLabel, formatMonthLabel } from '@/lib/dates.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  monthId: { type: String, default: '' },
  monthDoc: { type: Object, default: null }, // for currency + setup state
  expense: { type: Object, default: null }, // null = add, else edit
  onSave: { type: Function, default: null }, // async (payload, id|null) => void
})
const emit = defineEmits(['update:open'])

const { locale } = useSettings()
const currency = computed(() => props.monthDoc?.currency)
const isSetup = computed(() => !!props.monthDoc)
const isEdit = computed(() => !!props.expense?.id)
const monthLabel = computed(() => formatMonthLabel(props.monthId, locale.value))

const monthMin = computed(() => `${props.monthId}-01`)
const monthMax = computed(() => {
  const [y, m] = String(props.monthId).split('-').map(Number)
  if (!y || !m) return undefined
  return `${props.monthId}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
})
function clampedToday() {
  const t = todayISO()
  return t >= monthMin.value && monthMax.value && t <= monthMax.value ? t : monthMin.value
}

const form = reactive({ item: '', amount: 0, date: '', note: '' })
const saving = ref(false)
const datePopover = ref(false)

// (Re)seed the form whenever the sheet opens.
watch(() => props.open, (o) => {
  if (!o) return
  const e = props.expense
  form.item = e?.item ?? ''
  form.amount = e?.amount ?? 0
  form.date = e?.date ?? clampedToday()
  form.note = e?.note ?? ''
})

const safeParse = (iso) => { try { return iso ? parseDate(iso) : undefined } catch { return undefined } }
const dateValue = computed({
  get: () => safeParse(form.date),
  set: (v) => { if (v) { form.date = v.toString(); datePopover.value = false } },
})
const minValue = computed(() => safeParse(monthMin.value))
const maxValue = computed(() => safeParse(monthMax.value))

// On touch devices, let the sheet open without grabbing focus — otherwise the
// dialog auto-focuses the first input and the on-screen keyboard covers it.
// Desktop keeps its convenient auto-focus.
function onOpenAutoFocus(e) {
  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) e.preventDefault()
}

async function submit() {
  if (!isSetup.value || !props.onSave) return
  const item = form.item.trim()
  if (!item) return toast.error('Enter what you spent on')
  if (!(form.amount > 0)) return toast.error('Enter an amount greater than zero')
  if (form.date < monthMin.value || (monthMax.value && form.date > monthMax.value)) return toast.error(`Date must be within ${monthLabel.value}`)
  saving.value = true
  try {
    await props.onSave({ date: form.date, item, amount: form.amount, note: form.note.trim() }, props.expense?.id ?? null)
    toast.success(isEdit.value ? 'Expense updated' : 'Expense added')
    emit('update:open', false)
  }
  catch { toast.error('Could not save expense') }
  finally { saving.value = false }
}
</script>

<template>
  <UiSheet :open="open" @update:open="emit('update:open', $event)">
    <UiSheetContent side="bottom" class="mx-auto max-w-lg gap-0 rounded-t-2xl" @open-auto-focus="onOpenAutoFocus">
      <UiSheetHeader class="pb-2">
        <UiSheetTitle>{{ isEdit ? 'Edit expense' : 'Add expense' }}</UiSheetTitle>
        <UiSheetDescription>{{ monthLabel }}</UiSheetDescription>
      </UiSheetHeader>

      <div v-if="!isSetup" class="px-6 py-8 text-center text-sm text-muted-foreground">
        This month isn't set up yet.
        <NuxtLink :to="`/months/${monthId}`" class="font-medium text-primary underline-offset-4 hover:underline" @click="emit('update:open', false)">Set it up</NuxtLink>
        first.
      </div>

      <form v-else class="space-y-4 px-6 pb-2" @submit.prevent="submit">
        <div class="space-y-1.5">
          <UiLabel for="expense-item">Item</UiLabel>
          <UiInput id="expense-item" v-model="form.item" placeholder="e.g. Groceries" autocomplete="off" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1.5">
            <UiLabel for="expense-amount">Amount</UiLabel>
            <MoneyInput id="expense-amount" v-model="form.amount" :currency="currency" />
          </div>
          <div class="space-y-1.5">
            <UiLabel>Date</UiLabel>
            <UiPopover v-model:open="datePopover">
              <UiPopoverTrigger as-child>
                <UiButton variant="outline" type="button" class="w-full justify-start px-3 font-normal" :class="!form.date && 'text-muted-foreground'">
                  <CalendarIcon class="size-4 shrink-0 opacity-70" />
                  <span class="truncate">{{ form.date ? formatDateLabel(form.date, locale) : 'Pick a date' }}</span>
                </UiButton>
              </UiPopoverTrigger>
              <!-- disable-portal: the popover lives inside the modal Sheet; teleporting
                   it to <body> leaves it outside the dialog's focus + pointer-events
                   region, so on Safari the calendar opens but isn't tappable. Keeping
                   it inline (fixed strategy so it still floats above the sheet) fixes it. -->
              <UiPopoverContent class="w-auto p-0" align="start" disable-portal position-strategy="fixed">
                <UiCalendar v-model="dateValue" :min-value="minValue" :max-value="maxValue" weekday-format="short" class="[--cell-size:--spacing(9)]" initial-focus />
              </UiPopoverContent>
            </UiPopover>
          </div>
        </div>
        <div class="space-y-1.5">
          <UiLabel for="expense-note">Note <span class="text-muted-foreground">(optional)</span></UiLabel>
          <UiTextarea id="expense-note" v-model="form.note" placeholder="Anything to remember" rows="2" class="resize-none" />
        </div>
      </form>

      <UiSheetFooter v-if="isSetup">
        <UiButton :disabled="saving" @click="submit">{{ saving ? 'Saving…' : (isEdit ? 'Save changes' : 'Add expense') }}</UiButton>
        <UiSheetClose as-child><UiButton variant="outline" :disabled="saving">Cancel</UiButton></UiSheetClose>
      </UiSheetFooter>
    </UiSheetContent>
  </UiSheet>
</template>
