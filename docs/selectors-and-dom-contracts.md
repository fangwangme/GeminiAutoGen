# Selectors and DOM Contracts

This document lists critical Gemini DOM selectors used by automation logic.

## Input/Send/Stop

Defined in `src/content/pageSelectors.ts`.

Input candidates:
- `.ql-editor.textarea[contenteditable="true"]`
- `.ql-editor[contenteditable="true"]`
- `div[role="textbox"][contenteditable="true"]`
- `rich-textarea .ql-editor[contenteditable="true"]`

Send button candidates:
- `button[aria-label="Send message"]`
- `button.send-button`
- `button.submit`
- `button[mattooltip="Send message"]`

Stop button candidates:
- `button[aria-label="Stop responding"]`
- `button[mattooltip="Stop responding"]`

## Conversation/Response Containers

Primary container selectors:
- `.conversation-container`
- `.response-container`
- `model-response`

Prompt anchor helpers:
- `user-query`
- rendered text matching `name: <filename>`

## Image and Download Controls

Image candidates:
- `single-image img`
- `generated-image img`
- `img[src*="googleusercontent"]`
- `img.loaded`

Download button candidates:
- `download-generated-image-button button`
- `button[aria-label*="Download"]`
- `button[mattooltip*="Download"]`
- `button[data-test-id*="download"]`

## Contract Expectations

- Last history image must be loaded before new prompt send gate passes.
- Last-image detection ignores small/non-generated image noise (`<=100px`) to avoid false waits.
- If the latest response matches built-in/custom warning patterns, warning gate takes precedence and history wait passes immediately.
- Target response container should correspond to new prompt anchor when possible.
- Download button lookup is scoped to target container first; global fallback second.

## Maintenance Guidance

When Gemini DOM changes:
1. update selectors in `domHelpers.ts` / `pageSelectors.ts`
2. keep fallback selector families broad but scoped
3. verify with sidepanel logs + watchdog snapshot fields
