# Evidence and recovery

Use the weakest sufficient evidence for the current claim and describe it precisely:

1. **Input executed:** the tool reports that it dispatched the write.
2. **Page value verified:** a returned or fresh snapshot shows the intended value or selected state.
3. **Page reports saved:** a success message, persisted record card or restored draft appears after the save action.
4. **Backend confirms saved:** a related response explicitly confirms the same save operation.

Input execution alone is never evidence of persistence. A completed HTTP request is not enough unless its response belongs to the current save and confirms the business result.

When a write, save or navigation times out or disconnects, treat side effects as possible:

- Re-list pages if navigation may have occurred.
- Take a fresh snapshot before any retry.
- Compare the current page, values, record cards and success/error messages with the intended state.
- Retry only the missing field or action when the first attempt clearly did not happen.
- If evidence remains ambiguous, stop and ask the user to inspect the page. Do not create a duplicate record or repeat a save/next-step action.

When a SPA replaces a node between snapshot and action, the runtime can recover only a unique semantic match. `stale_uid_ambiguous` means multiple current nodes share the old control's semantics; `stale_uid_unresolved` means no unique current match survived. In either case, take a fresh snapshot, use the current section or popup to narrow the target, and check whether the failed action already focused or changed it. Never fall back to a fixed number of Tab, ArrowDown or paging operations without verifying the current highlighted or selected state.

After an ordinary next step, confirm the expected section or route before continuing. An unexpected login page, origin change or final-review screen requires replanning.
