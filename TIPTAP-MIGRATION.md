# Tiptap migration status

The Notebook editor now uses Tiptap with Vanilla JavaScript and Vite. Cloudflare remains the hosting and backend platform.

## Compatibility contract

- Documents continue to load from and save to the existing `html` field.
- Existing document IDs and annotation `data-item` attributes are preserved.
- Translation, speech, sentence extraction, media, D1 persistence, and card APIs are unchanged.
- Vite only bundles the frontend. It does not replace the Cloudflare Worker or D1 database.

## Editor features migrated

- Paragraphs, headings, block quotes, and code blocks
- Bold, italic, underline, highlight, superscript, and subscript
- Bulleted and numbered lists
- Text alignment and indentation
- Links, horizontal rules, and tables
- Undo and redo
- Flashcard annotation marks and Japanese reading marks

## Language-learning enhancements

- Editing and distraction-reduced reading modes
- Four-color persistent highlights
- Inline comments stored inside the existing HTML document
- Phrase capture without creating a flashcard
- Contextual AI language-assistant panel
- Semantic Japanese `ruby` markup with `rt` readings

These features remain compatible with the existing HTML field, so no D1 schema migration is required.

## Build

```sh
npm install
npm run build
```

Upload the contents of `dist/` to the `coach-page` static-assets Worker. Do not upload `node_modules/` or the source files.

