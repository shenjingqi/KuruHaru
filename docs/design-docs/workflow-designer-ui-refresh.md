# Workflow Designer UI Refresh

> Status: Draft
> Updated: 2026-03-07

## Goal

Refresh the Workflow Designer shell without changing workflow runtime behavior:

- clarify information hierarchy
- move shell styling onto reusable tokens
- make the layout mobile-first and progressively enhanced

## Changes

### 1. Information Architecture

- The hero section now separates workflow identity, workflow summary, primary actions, and current focus context.
- Four overview cards stay visible at all times: graph scale, validation health, runtime progress, and selection context.
- The left node library is now treated as a stable resource panel instead of a hover-only drawer.
- Bridge and run controls are grouped into a dedicated control console for linking, dispatch strategy, zoom, and execution.
- Inline node inspection is now preferred only on wide canvases; narrower widths fall back to the right inspector to reduce overlap.

### 2. Visual System

- Added workflow-specific semantic tokens in `WorkflowDesigner.vue` (`--wf-*`) and mapped them to the orbit palette.
- Standardized panel chrome, radii, shadows, badges, and borders across the shell and workflow drawers.
- Shifted the palette away from uniform blue: the shell now uses warm copper, teal, and rose accents to separate hero, node library, control console, and inspector surfaces.
- Kept the dark mission-control canvas aesthetic while making shell surfaces and controls token-driven for future theme alignment.

### 3. Responsive Rules

- Base layout is single-column.
- `768px+`: overview cards move to two columns; inspector tabs and key data grids expand.
- `1024px+`: hero becomes two-column; main workspace becomes `left rail + canvas`, with the right inspector stacked below.
- `1440px+`: main workspace becomes `left rail + canvas + right inspector`.

## Node Card Refinement

- Node cards now use a structured workstation block layout with dedicated port clusters, a header strip, a runtime status lamp, and parameter rows.
- Input and output ports expose explicit `IN` / `OUT` labels and connection-state hints.
- The header now separates node badge, node family, runtime status, and destructive action into a tool-like title bar.
- Parameter summaries are rendered as compact rows instead of a single sentence, improving scanability on the canvas.

## Primary Files

- `src/renderer/src/components/WorkflowDesigner.vue`
- `src/renderer/src/components/workflow/WorkflowLibraryDrawer.vue`
- `src/renderer/src/components/workflow/WorkflowBridgeDrawer.vue`

## Follow-Up

- If more pages adopt the same shell pattern, extract the workflow tokens from `WorkflowDesigner.vue` into a shared theme layer.
- Continue consolidating duplicate runtime and log surfaces so the bottom dock and right inspector do not compete for the same information.
- Keep `useWorkflowDesigner.js` defaults aligned with renderer-side sizing constants whenever node card defaults change.
