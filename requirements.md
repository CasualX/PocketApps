# Todo: Buy — Requirements

This document specifies functional, UI, data, and non-functional requirements so an AI (or developer) can implement the `Todo: Buy` single-file web app equivalent to the provided `todo-buy.html`.

## Overview
- Purpose: A small single-page web app to create and manage shopping list entries grouped by store, with two modes: Add Item and Shopping.
- Primary interactions: add/update entries, pick store/item (with history), set quantity and notes, switch to shopping mode to mark items skipped or remove completed items.
- Storage: client-side persistence using `localStorage` keyed under `todo_buy_data`.

## Data Model (shape stored in localStorage)
- Root object keys:
  - `storeHistory`: string[] — list of previously used store names (order preserved)
  - `itemHistory`: { [storeName: string]: string[] } — per-store item history
  - `entries`: Array<Entry>

- Entry object:
  - `store`: string
  - `itemName`: string
  - `quantity`: number | null
  - `notes`: string
  - `skipped`: boolean

- Default sample data when no storage exists:
  - `storeHistory = ['Grocery', 'Hardware Store']`
  - `itemHistory = { 'Grocery': ['Milk', 'Bread'] }`
  - `entries = []`

## App Shell / DOM contract
- Single HTML page with a main `app` JS object exposing methods used by UI handlers.
- Important element IDs (must exist and be referenced):
  - `btn-mode-add`, `btn-mode-shop` — mode toggle buttons
  - `view-add`, `view-shop-stores`, `view-shop-items` — high-level views
  - `disp-store`, `disp-item`, `disp-qty`, `disp-notes` — display fields in Add view
  - `main-action-btn` — footer primary action button
  - Overlays and inputs: `overlay-store`, `input-store`, `list-stores`; `overlay-item`, `input-item`, `list-items`; `overlay-quantity`, `input-qty`; `overlay-notes`, `input-notes`.
  - `list-stores` and `list-items` are the containers for searchable lists.
- Classes relied upon for styling and small behaviors (examples): `card`, `selector-card`, `value`, `placeholder`, `overlay`, `open`, `store-row-card`, `item-row`, `skipped`, `skip-btn`, `list-item`, `present`, `delete-icon`.

## Functional Requirements
1. Initialization
   - On `DOMContentLoaded` app initializes by loading data from `localStorage` key `todo_buy_data` or sets default sample data.
   - App state:
     - `mode`: `'add' | 'shop'`
     - `view`: `'stores' | 'items'` (used only in `shop` mode)
     - `activeShopStore`: string | null (selected store in shopping mode)
   - Temporary `draft` for add form: `{ store, item, qty, notes }`.

2. Mode switching
   - `setMode('add'|'shop')` toggles UI, updates button active state, resets `view` to `stores` when entering shop, and updates `main-action-btn` label and style.

3. Add Item Mode
   - Add view displays four selector cards: Store, Item, Quantity, Notes.
   - Store overlay:
     - Search input filters `storeHistory` (case-insensitive substring match).
     - If user types a string and presses Enter (or clicks the `Use: <typed>` row), selecting that value adds it to `storeHistory` (if new), sets `draft.store` and clears `draft.item` when store changes.
     - Each `list-item` includes a delete icon to remove store from history; deleting removes any `itemHistory[store]` as well.
   - Item overlay (requires `draft.store` selected):
     - Search input filters `itemHistory[draft.store]`.
     - Typing a new value shows a `Use: <typed>` row; selecting it adds to the `itemHistory` array for that store.
     - Selecting an existing item prefills the draft quantity and notes if an entry already exists in `entries` for that store+item.
     - Each `list-item` includes a delete icon that removes item from that store's history.
   - Quantity overlay (requires store and item): numeric input; empty string means unspecified and should be represented as `null` in model.
   - Notes overlay: free text; trimmed when saved.
   - Save/Add behavior (`main-action-btn` when in add mode):
     - Validation: require `draft.store` and `draft.item`; show `alert` if missing.
     - If an `entries` item exists for same store+item, replace it (update); otherwise append new entry with `skipped:false`.
     - Ensure selected item is added to `itemHistory[store]` if missing.
     - Persist to localStorage after change.
     - Provide transient UI feedback (button text change to "Saved!" and green background for ~1s), then reset draft.item, draft.qty, draft.notes to initial values (store remains selected).

4. Shopping Mode
   - `view = 'stores'` shows a list of unique stores from `entries` with counts.
   - Tapping a store changes `view` to `items` and sets `activeShopStore`.
   - `view = 'items'` shows entries for the selected store.
     - Items are sorted so non-skipped items appear first.
     - Each item row shows: `itemName`, optional quantity as `x<quantity>` badge, optional notes as a subtle line, and a `Skip` / `Restore` button. Rows with `skipped=true` get `.skipped` styling and strike-through the name.
     - `toggleSkip(store,item)` flips `skipped` flag and persists.
   - `main-action-btn` when in shop mode reads "Complete Shopping"; when clicked:
     - If `view === 'stores'`, confirm removal of all non-skipped items across all stores; on confirm remove non-skipped entries, keep skipped ones but reset their `skipped` to `false`.
     - If `view === 'items'`, confirm removal of non-skipped items only for the `activeShopStore` and perform similar filtering.
     - Persist changes to storage and return to `stores` view.

5. Deleting from histories
   - Deleting a store from `storeHistory` removes it from history and deletes `itemHistory[store]` too; existing entries in `entries` that reference that store should remain (unless specified otherwise) — the current implementation deletes only history, not entries. Include test cases to ensure expected behavior.
   - Deleting an item from `itemHistory` does not remove entries already added to `entries`.

## UI and Interaction Details (significant specifics)
- Overlays are implemented as full-screen panels with `.overlay` and toggled by `.open`.
- Overlay header includes a left `Cancel` button and a right `Done` button (for quantity/notes). For store/item overlays the `Done` button is not required — selection happens via list rows.
- Input behavior:
  - `input-store` and `input-item` show a `Use: <typed>` list row when query length > 0.
  - Pressing Enter on those inputs triggers selection of the typed value.
  - `input-qty` accepts numeric entry and on Enter or Done sets `draft.qty` to `null` for empty string or parsed integer for digits.
- Visual state:
  - Placeholders use class `placeholder` vs `value` when a display field is empty.
  - When selecting the same store twice, `draft.item` should be cleared.
  - `list-item.present` marks items already present in `entries` for that store with a visual indicator.

## Accessibility & Keyboard
- Inputs must support Enter key for quick selection.
- Buttons should be keyboard-focusable and labeled.
- Use semantic elements where possible (buttons, header, main, footer).
- Ensure color contrasts meet reasonable legibility in dark theme (current CSS uses dark palette).

## Persistence & Robustness
- All changes to `data` must call `saveData()` which serializes JSON to `localStorage` under `todo_buy_data`.
- `loadData()` should catch JSON parse errors and fall back to default structure.
- Guard against missing `itemHistory[store]` (treat as empty array) when referencing.
- When saving quantity from input, coerce to integer or null; avoid NaN in stored data.

## Styling / Theming
- Implement same CSS variables and layout strategy: `:root` variables for primary, text, bg, header/footer heights, animation speed.
- Header is fixed with backdrop blur and translucent dark background; footer is fixed with primary action button.
- Cards use rounded corners, subtle borders, and consistent padding.
- Overlays slide up/down using CSS transform and transition (class `.open` toggles transform).

## Animations
- Use transition timing `--anim-speed: 0.25s` and cubic-bezier similar to the current file for overlay.
- Use subtle scaling or background color transitions for active mode button.

## Edge Cases & Acceptance Criteria
- Adding an item with same store+item updates existing entry instead of creating duplicate.
- Quantity empty string => stored as `null`; displayed text "Tap to enter quantity...".
- Selecting Item overlay without a store first shows an alert and prevents opening.
- Selecting Quantity or Notes overlays without store+item shows an alert.
- Deleting store from history should not delete existing `entries` (document expected behavior).
- Toggling Skip updates the specific entry and persists; skipped items remain until completion.
- Completing shopping removes non-skipped items only (global or store-specific) and un-skips remaining items.
- UI feedback after saving: show "Saved!" then revert to previous label and reset relevant draft fields.

## Developer API / Functions to Implement
- `init()` — load data and render initial UI.
- `loadData()` / `saveData()` — persistence layer.
- `setMode(mode)` — toggle add/shop mode.
- `render()` — top-level render routing to `renderAddForm()`, `renderShopStores()`, `renderShopItems()`.
- `renderAddForm()` — update display fields and footer label.
- `openOverlay(type)` / `closeOverlay()` — overlay control and prefill inputs.
- `renderStoreList()` / `selectStore(name)` / `deleteStore(name)`
- `renderItemList()` / `selectItem(name)` / `deleteItem(name)`
- `confirmQuantity()` / `confirmNotes()`
- `handleMainAction()` -> dispatch to `addEntry()` or `completeShopping()`
- `addEntry()` / `toggleSkip(store,item)` / `completeShopping()` / `executeCompletion(store?)`

Each function should be small, testable, and only manipulate the `app.data`, `app.draft`, and `app.state` data structures and then call `saveData()` where needed.

## Testing & Acceptance Scenarios (manual + automated suggestions)
- Manual test flows:
  1. Add new store and item via typing and selecting. Verify storeHistory and itemHistory updated and entry created in `entries`.
  2. Add same store+item again with different quantity/notes and ensure entry is updated.
  3. Open shopping mode, select store, skip an item, and verify visual change and `skipped=true` persisted.
  4. Complete shopping at store level and verify non-skipped items removed and skipped items retained but un-skipped.
  5. Delete store from history and verify history removed but entries remain.
  6. Type input and press Enter to use typed value from overlays.

- Unit test ideas (if extracting JS into modules):
  - `loadData()` parses stored JSON and returns default when invalid.
  - `addEntry()` handles insert vs update.
  - `executeCompletion()` removes only non-skipped entries and resets skipped flags.
  - `toggleSkip()` toggles boolean and saves.

## Optional Improvements (not required but recommended)
- Replace `alert`/`confirm` with custom modal UI components for consistent design.
- Add undo (toast) after completion allowing quick restore.
- Add import/export (JSON) for backup.
- Add search within shopping mode to quickly find items across stores.

## Deliverables
- A single HTML file or a small multi-file SPA implementing the UI, JS logic, and CSS variables described above.
- A `requirements.md` (this file), and optionally a README with run instructions if external tooling is used.

---

End of requirements.
