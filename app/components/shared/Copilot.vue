<script setup>
// The AI copilot: a floating button that opens a FULL-SCREEN chat workspace —
// a sidebar to switch/resume past conversations + a centered, readable message
// column. Mounted once in the default layout for signed-in users, so it's
// available on every page. Read-only: it answers questions about the user's
// finances. The whole conversation is sent as context on every turn.
import { ref, computed, watch, nextTick } from 'vue'
import { SparklesIcon, SendIcon, PlusIcon, MenuIcon, Trash2Icon } from '@lucide/vue'
import { currentMonthId, formatMonthLabel } from '@/lib/dates.js'

const chat = useChat()
const { isOpen, threadId, threads, messages, isStreaming, streamingText, statusLabel, error } = chat

const draft = ref('')
const scroller = ref(null)
const showThreads = ref(false) // mobile sidebar drawer
const pendingDelete = ref(null) // thread targeted for deletion
const confirmOpen = ref(false)  // delete-confirmation dialog open state

const monthLabel = computed(() => formatMonthLabel(currentMonthId()))
const suggestions = computed(() => [
  `How much did I spend in ${monthLabel.value}, and where did it go?`,
  'Am I on track with my daily budget this month?',
  'How much have I invested this year, and into what?',
  'What\'s my savings-rate trend over the last 6 months?',
])

const activeTitle = computed(() => {
  const t = threads.value.find((x) => x.id === threadId.value)
  return t?.title || 'New conversation'
})
const showEmpty = computed(() => !messages.value.length && !isStreaming.value && !streamingText.value)

function relTime(ts) {
  const d = ts?.toDate ? ts.toDate() : (ts instanceof Date ? ts : null)
  if (!d) return ''
  const s = (Date.now() - d.getTime()) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`
  return d.toLocaleDateString()
}

function scrollToBottom() {
  nextTick(() => { const el = scroller.value; if (el) el.scrollTop = el.scrollHeight })
}
watch([messages, streamingText, statusLabel, isOpen], scrollToBottom, { deep: true })

function selectThread(tid) { chat.openThread(tid); showThreads.value = false }
function onNewChat() { chat.newThread(); showThreads.value = false }

function askDelete(t) { pendingDelete.value = t; confirmOpen.value = true }
async function confirmDelete() {
  const t = pendingDelete.value
  confirmOpen.value = false
  if (t) await chat.deleteThread(t.id)
}

async function submit() {
  const text = draft.value.trim()
  if (!text || isStreaming.value) return
  draft.value = ''
  await chat.send(text)
}
function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
}
function useSuggestion(s) {
  if (isStreaming.value) return
  draft.value = ''
  chat.send(s)
}
</script>

<template>
  <div>
    <!-- Floating action button (clears the mobile bottom tab bar / center "+") -->
    <button
      type="button"
      aria-label="Open Finina Copilot"
      class="fixed bottom-24 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:opacity-90 md:bottom-6 md:right-6"
      @click="chat.open()"
    >
      <SparklesIcon class="size-5" />
    </button>

    <!-- Full-screen chat workspace -->
    <UiSheet :open="isOpen" @update:open="(v) => (v ? chat.open() : chat.close())">
      <UiSheetContent
        side="right"
        class="flex flex-col gap-0 p-0 data-[side=right]:inset-0 data-[side=right]:w-full data-[side=right]:max-w-none sm:data-[side=right]:max-w-none"
      >
        <UiSheetHeader class="sr-only">
          <UiSheetTitle>Finina Copilot</UiSheetTitle>
          <UiSheetDescription>Chat with your AI finance copilot</UiSheetDescription>
        </UiSheetHeader>

        <div class="relative flex min-h-0 flex-1">
          <!-- Mobile backdrop when the thread drawer is open -->
          <div v-if="showThreads" class="absolute inset-0 z-20 bg-black/40 md:hidden" @click="showThreads = false" />

          <!-- Sidebar: conversation list (persistent on md+, drawer on mobile) -->
          <aside
            :class="[
              'w-72 shrink-0 flex-col border-r bg-popover',
              showThreads ? 'flex max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-xl' : 'hidden md:flex',
            ]"
          >
            <div class="flex items-center justify-between gap-2 border-b px-3 py-3">
              <span class="text-sm font-semibold">Chats</span>
              <UiButton variant="outline" size="sm" class="h-8 gap-1.5" :disabled="isStreaming" @click="onNewChat">
                <PlusIcon class="size-4" /> New
              </UiButton>
            </div>
            <div class="flex-1 overflow-y-auto p-2">
              <div
                v-for="t in threads"
                :key="t.id"
                class="group mb-1 flex items-center gap-1 rounded-md pr-1 transition"
                :class="t.id === threadId ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'"
              >
                <button type="button" class="min-w-0 flex-1 rounded-md px-3 py-2 text-left" @click="selectThread(t.id)">
                  <div class="truncate text-sm font-medium">{{ t.title || 'New chat' }}</div>
                  <div class="text-[11px] text-muted-foreground">{{ relTime(t.updatedAt) }}</div>
                </button>
                <button
                  type="button"
                  class="shrink-0 rounded p-1.5 text-muted-foreground opacity-0 transition hover:bg-background hover:text-negative focus:opacity-100 group-hover:opacity-100 max-md:opacity-100"
                  aria-label="Delete chat"
                  :disabled="isStreaming"
                  @click.stop="askDelete(t)"
                >
                  <Trash2Icon class="size-4" />
                </button>
              </div>
              <p v-if="!threads.length" class="px-3 py-8 text-center text-xs text-muted-foreground">
                No chats yet. Ask something to start one.
              </p>
            </div>
          </aside>

          <!-- Main chat column -->
          <div class="flex min-w-0 flex-1 flex-col">
            <header class="relative flex items-center gap-2 border-b px-4 py-3 pr-12">
              <UiButton variant="ghost" size="icon" class="size-8 md:hidden" aria-label="Chats" @click="showThreads = !showThreads">
                <MenuIcon class="size-4" />
              </UiButton>
              <span class="flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                <SparklesIcon class="size-4" />
              </span>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold leading-none">Finina Copilot</p>
                <p class="truncate text-xs text-muted-foreground">{{ activeTitle }}</p>
              </div>
              <div class="ml-auto">
                <UiButton variant="ghost" size="sm" class="h-8 gap-1.5" :disabled="isStreaming" @click="onNewChat">
                  <PlusIcon class="size-4" /> <span class="max-sm:hidden">New chat</span>
                </UiButton>
              </div>
            </header>

            <!-- Messages -->
            <div ref="scroller" class="flex-1 overflow-y-auto">
              <div class="mx-auto w-full max-w-3xl px-4 py-4">
                <template v-if="showEmpty">
                  <div class="flex flex-col items-center justify-center gap-4 py-12 text-center">
                    <span class="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <SparklesIcon class="size-6" />
                    </span>
                    <div class="space-y-1">
                      <p class="text-sm font-medium">Your financial copilot</p>
                      <p class="text-xs text-muted-foreground">I can read your plans, months, spending and investments to answer questions.</p>
                    </div>
                    <div class="flex w-full max-w-md flex-col gap-2">
                      <button
                        v-for="s in suggestions"
                        :key="s"
                        type="button"
                        class="rounded-lg border bg-card px-3 py-2 text-left text-xs text-foreground transition hover:bg-accent"
                        @click="useSuggestion(s)"
                      >
                        {{ s }}
                      </button>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div class="space-y-3">
                    <CopilotMessage v-for="m in messages" :key="m.id" :role="m.role" :content="m.content" :status="m.status" />
                    <CopilotMessage v-if="isStreaming || streamingText" role="assistant" :content="streamingText" />
                    <div v-if="isStreaming && statusLabel" class="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                      <UiSpinner class="size-3" /> {{ statusLabel }}
                    </div>
                    <div v-else-if="isStreaming && !streamingText" class="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                      <UiSpinner class="size-3" /> Thinking…
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- Inline error + retry -->
            <div v-if="error && !isStreaming" class="border-t bg-negative/5">
              <div class="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-4 py-2 text-xs text-negative">
                <span class="min-w-0 truncate">{{ error }}</span>
                <UiButton size="sm" variant="outline" class="h-7 shrink-0" @click="chat.retry()">Retry</UiButton>
              </div>
            </div>

            <!-- Composer -->
            <div class="border-t">
              <div class="mx-auto w-full max-w-3xl p-3">
                <div class="flex items-end gap-2">
                  <UiTextarea
                    v-model="draft"
                    placeholder="Ask about your spending, budget, investments…"
                    rows="1"
                    class="max-h-40 min-h-9 flex-1 resize-none"
                    :disabled="isStreaming"
                    @keydown="onKeydown"
                  />
                  <UiButton size="icon" class="size-9 shrink-0" :disabled="isStreaming || !draft.trim()" aria-label="Send message" @click="submit">
                    <SendIcon class="size-4" />
                  </UiButton>
                </div>
                <p class="mt-1.5 px-1 text-[10px] text-muted-foreground">Finina Copilot can make mistakes — verify important numbers.</p>
              </div>
            </div>
          </div>
        </div>
      </UiSheetContent>
    </UiSheet>

    <!-- Delete-chat confirmation -->
    <UiAlertDialog :open="confirmOpen" @update:open="(v) => { confirmOpen = v }">
      <UiAlertDialogContent>
        <UiAlertDialogHeader>
          <UiAlertDialogTitle>Delete this chat?</UiAlertDialogTitle>
          <UiAlertDialogDescription>
            “{{ pendingDelete?.title || 'New chat' }}” and all its messages will be permanently deleted. This can’t be undone.
          </UiAlertDialogDescription>
        </UiAlertDialogHeader>
        <UiAlertDialogFooter>
          <UiAlertDialogCancel>Cancel</UiAlertDialogCancel>
          <UiAlertDialogAction class="bg-negative text-white hover:bg-negative/90" @click="confirmDelete">Delete</UiAlertDialogAction>
        </UiAlertDialogFooter>
      </UiAlertDialogContent>
    </UiAlertDialog>
  </div>
</template>
