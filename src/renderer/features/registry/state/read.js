import { onScopeDispose } from 'vue';
import { createRequestChannel } from '../../../infrastructure/requestScope.js';

// Capture the ticket before queueing the read, even when the same key is selected again.
export function createRegistryRead(staleResult) {
  const channel = createRequestChannel();
  let ticket;

  function invalidate() {
    channel.invalidate();
    ticket = undefined;
  }

  function run(key, read) {
    if (ticket?.key !== key) {
      channel.invalidate();
      ticket = channel.issue(key);
    }
    const { isCurrent } = ticket;
    return channel.run(key, () => isCurrent() ? read(isCurrent) : staleResult);
  }

  onScopeDispose(() => channel.dispose());
  return { run, invalidate };
}
