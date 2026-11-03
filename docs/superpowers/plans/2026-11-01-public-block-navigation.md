# Public block navigation implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task.

**Goal:** Opening a public note source at `#^id` reveals the referenced block, as native Obsidian does.

**Architecture:** Keep block IDs as inert metadata on their parsed Markdown blocks instead of deleting them before parsing. Resolve public fragment navigation inside the root note, excluding embedded children. No publication/access changes, new dependencies or Bases changes.

**Tech Stack:** TypeScript, unified/remark/rehype, Vitest, Electron browser integration.

**Spec:** Native reference `scripts/capture-obsidian-block-navigation.mjs`, Obsidian 1.14.5. Paragraph IDs attach inline; standalone IDs attach to the preceding list, table or code block. IDs stay invisible. Synthetic notes remain byte-identical.

## Review focus

Literal code, escaped carets, comments and HTML must not create Markdown block anchors. Standalone identifiers must attach to the preceding block without leaving empty paragraphs. Repeated IDs inside embedded notes must never redirect the root note's navigation. Hash changes, missing targets and malformed percent encoding must remain safe. Existing heading navigation and block transclusion must keep working.

## Task 1: Block metadata and public navigation

- [x] Add failing SSR tests for block metadata, literal protection and standalone markers.
- [x] Add browser fixtures for public block source buttons and root-only scrolling; confirm red.
- [x] Add a remark block-ID transform before callouts, then restore only parser-owned block metadata after sanitization using source positions and element types.
- [x] Add block navigation to the existing public fragment handler.
- [x] Run targeted tests, independent review, full regressions and builds.

Review findings addressed: tight-list paragraph removal, inline callout restructuring, raw HTML metadata spoofing, and source-offset collision between a list and its first item. Native capture extended to item/callout/quote. Focused SSR7 and real-browser source/hash navigation passed; full regression remains a gate.
