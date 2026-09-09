# Block 1B — Auto Sync Validation

## Status

```text
BLOCK 0:  CLOSED
BLOCK 1A: MANUAL FULL-RES LINK — USER VISUAL PASS / CLOSED
BLOCK 1B: AUTO SYNC — IMPLEMENTED / USER FUNCTIONAL PASS
```

The installed Photoshop 2026 event probe is complete. Production Auto Sync now
uses the single event observed across every representative operation:
`historyStateChanged`.

## Baseline recorded before Block 1B work

```text
HEAD: 91ac0aec4a65fb7bb3d6c3c07a405d9b16fea212
Block 1A changes: present and uncommitted
```

No reset, restore, checkout, or clean operation was used. The Block 1A working
tree remains the implementation baseline.

## Official discovery mechanism

Photoshop's official developer-mode catch-all action notification mechanism is:

```js
action.addNotificationListener(['all'], callback)
```

The UXP panel contains a temporary **Event Probe — Development Only** section.
It records event names and counts against an explicitly armed operation. It is
not connected to frame capture and cannot trigger Auto Sync.

Listener lifecycle is explicit:

- `START PROBE` registers the single callback once.
- Repeated Start cannot duplicate the listener.
- `STOP PROBE` removes the exact same callback.
- `CLEAR PROBE RESULTS` clears observations without changing registration.
- Reloading the development plugin resets the probe to stopped.

## Manual event probe

Status: **MANUAL EVENT PROBE COMPLETE**

1. Start the Electron app with `npm run dev`.
2. Reload the UXP plugin.
3. In **Event Probe — Development Only**, press `START PROBE`.
4. Select an operation, press `ARM SELECTED OPERATION`, then perform only that
   Photoshop operation.
5. Repeat step 4 for each operation below.
6. Press `STOP PROBE`.
7. Capture the complete Event Probe results or report the event summary text.

Do not press `SEND FULL RES` while probing; the probe must describe user edits,
not the plugin's own capture activity.

| Operation | Result | Observed event / method |
|---|---|---|
| Paint / Brush | SUPPORTED | `historyStateChanged` ×54 |
| Layer Visibility | SUPPORTED | `historyStateChanged` ×5; direct `hide`/`show` also observed |
| Move | SUPPORTED | `historyStateChanged` ×3; direct `move` was not required for the listener |
| Transform | SUPPORTED | `historyStateChanged` ×1; direct `transform` ×1 also observed |
| Paste | SUPPORTED | `historyStateChanged` ×9; direct `paste` ×9 also observed |
| Layer Create | SUPPORTED | `historyStateChanged` ×7; direct `make` also observed |
| Layer Delete | SUPPORTED | `historyStateChanged` ×1; direct `delete` ×1 also observed |
| Adjustment / Property | SUPPORTED | `historyStateChanged` ×29; direct `set` ×4 also observed |

The probe observed 317 notifications in total. Direct action events were not
added to the production subscription because doing so would duplicate triggers
for operations already covered by `historyStateChanged`. The catch-all `all`
listener remains an explicitly user-controlled development-only probe and is
not used by Auto Sync.

## Auto Sync implementation

```text
historyStateChanged notification
→ 350 ms quiet-period debounce
→ requestLatestFrame('auto')
→ existing Block 1A capture/send/ACK path
```

Manual Send calls the same `requestLatestFrame('manual')` entrypoint. Requests
arriving during `CAPTURING`, `SENDING`, or `WAITING_ACK` set one dirty state;
they do not create a frame queue. When the active frame finishes, only the
latest pending state is captured. A pending Auto Sync debounce is cancelled
when Auto Sync is turned OFF.

The production listener has explicit lifecycle flags. ON registers the exact
callback once; OFF removes that same callback. Repeated ON/OFF operations cannot
register duplicate listeners in one plugin runtime.

Live texture replacement does not call `applyFit()`. The first Photoshop Live
frame still opens in FIT mode, while subsequent Manual or Auto Sync frames keep
the current camera zoom, pan position, and view mode. The synthetic two-frame
link test changes the view to 200% after frame 1 and asserts that frame 2 does
not reset it.

UXP diagnostics now report:

- Auto Sync ON/OFF
- Notifications Seen / Accepted
- Debounced Triggers
- Frames Requested / Sent
- Dirty Replacements
- Last Event / time
- Notification to capture-start latency
- Last completed capture time

## Manual Auto Sync checkpoint

Status: **USER FUNCTIONAL PASS**

1. Keep Electron running and reload the UXP plugin.
2. Turn Auto Sync ON.
3. Make a clear Brush edit and confirm one eventual Electron update.
4. Make several rapid edits and confirm they coalesce rather than queue.
5. Turn Auto Sync OFF and confirm edits no longer update Electron.
6. Use `SEND FULL RES` and confirm the manual fallback still works.

The user confirmed satisfactory update responsiveness and subsequently reported
that the requested behavior was fully performed. The final live-view replacement
also preserves the current zoom, pan, and view mode; the user confirmed this in
the installed Photoshop workflow.

The latest Portable EXE was rebuilt and passed its independent packaged smoke
test after the view-preservation change. A separate manual Photoshop Live Link
check against that exact rebuilt EXE remains the final explicit validation debt.

## Fixed Block 1A constraints

The probe does not change the verified pipeline:

```text
Broker bind:              127.0.0.1:34100
UXP/renderer endpoint:    ws://localhost:34100
UXP Manifest allowlist:   ws://localhost/
Chunk size:               2 MiB
Capture:                  full document composite, RGB 8-bit sRGB
Resize / targetSize:      none
Manual Send:              retained
Auto Sync:                enabled; 350 ms debounce
```
