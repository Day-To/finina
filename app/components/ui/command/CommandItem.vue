<script setup>
import { CheckIcon } from "@lucide/vue";
import { reactiveOmit, useCurrentElement } from "@vueuse/core";
import { ListboxItem, useForwardPropsEmits, useId } from "reka-ui";
import { computed, onMounted, onUnmounted, ref } from "vue";
import { cn } from "@/lib/utils";
import { useCommand, useCommandGroup } from ".";
const props = defineProps({
    value: { type: null, required: true },
    disabled: { type: Boolean, required: false },
    asChild: { type: Boolean, required: false },
    as: { type: null, required: false },
    class: { type: [Boolean, null, String, Object, Array], required: false, skipCheck: true }
  });
const emits = defineEmits(["select"]);
const delegatedProps = reactiveOmit(props, "class");
const forwarded = useForwardPropsEmits(delegatedProps, emits);
const id = useId();
const { filterState, allItems, allGroups } = useCommand();
const groupContext = useCommandGroup();
const isRender = computed(() => {
  if (!filterState.search) {
    return true;
  } else {
    const filteredCurrentItem = filterState.filtered.items.get(id);
    if (filteredCurrentItem === void 0) {
      return true;
    }
    return filteredCurrentItem > 0;
  }
});
const itemRef = ref();
const currentElement = useCurrentElement(itemRef);
onMounted(() => {
  if (!(currentElement.value instanceof HTMLElement))
    return;
  allItems.value.set(id, currentElement.value.textContent ?? (props.value?.toString() ?? ""));
  const groupId = groupContext?.id;
  if (groupId) {
    if (!allGroups.value.has(groupId)) {
      allGroups.value.set(groupId, /* @__PURE__ */ new Set([id]));
    } else {
      allGroups.value.get(groupId)?.add(id);
    }
  }
});
onUnmounted(() => {
  allItems.value.delete(id);
});
</script>

<template>
  <ListboxItem
    v-if="isRender"
    v-bind="forwarded"
    :id="id"
    ref="itemRef"
    data-slot="command-item"
    :class="cn('data-selected:bg-muted data-selected:text-foreground data-selected:*:[svg]:text-foreground relative flex min-h-7 cursor-default items-center gap-2 rounded-md px-2.5 py-1.5 text-xs/relaxed outline-hidden select-none in-data-[slot=dialog-content]:rounded-md [&_svg:not([class*=size-])]:size-3.5 group/command-item data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0', props.class)"
    @select="() => {
      filterState.search = ''
    }"
  >
    <slot />
    <CheckIcon class="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100" />
  </ListboxItem>
</template>
