import { d as defineEventHandler } from '../../nitro/nitro.mjs';
import 'node:http';
import 'node:https';
import 'node:events';
import 'node:buffer';
import 'node:fs';
import 'node:path';
import 'node:crypto';
import 'node:url';

const expenses_get = defineEventHandler(() => ({
  ok: true,
  message: "Finina expense API is live. POST JSON { item, amount, note?, date? } to this URL."
}));

export { expenses_get as default };
//# sourceMappingURL=expenses.get.mjs.map
