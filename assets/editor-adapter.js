import { Editor, Extension, Mark, Node, mergeAttributes } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import Subscript from '@tiptap/extension-subscript'
import Superscript from '@tiptap/extension-superscript'
import { TableKit } from '@tiptap/extension-table'
import TextAlign from '@tiptap/extension-text-align'

const Annotation = Mark.create({
  name: 'annotation',
  inclusive: false,
  addAttributes() {
    return {
      itemId: { default: null, parseHTML: element => element.getAttribute('data-item') },
      kind: {
        default: 'phrase',
        parseHTML: element => element.classList.contains('hl-word') ? 'word' : 'phrase',
      },
    }
  },
  parseHTML() { return [{ tag: 'span[data-item]' }] },
  renderHTML({ HTMLAttributes }) {
    const { itemId, kind, ...rest } = HTMLAttributes
    return ['span', mergeAttributes(rest, { 'data-item': itemId, class: kind === 'word' ? 'hl-word' : 'hl-phrase' }), 0]
  },
})

const JapaneseReading = Mark.create({
  name: 'japaneseReading',
  inclusive: false,
  parseHTML() { return [{ tag: 'span.ja-reading' }] },
  renderHTML({ HTMLAttributes }) { return ['span', mergeAttributes(HTMLAttributes, { class: 'ja-reading' }), 0] },
})

const InlineComment = Mark.create({
  name: 'inlineComment',
  inclusive: false,
  addAttributes() {
    return { comment: { default: '', parseHTML: element => element.getAttribute('data-comment') || '' } }
  },
  parseHTML() { return [{ tag: 'span[data-comment]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, {
      class: 'inline-comment',
      title: HTMLAttributes.comment || '',
      'data-comment': HTMLAttributes.comment || '',
    }), 0]
  },
})

const PhraseCapture = Mark.create({
  name: 'phraseCapture',
  inclusive: false,
  addAttributes() {
    return { phrase: { default: '', parseHTML: element => element.getAttribute('data-phrase') || element.textContent || '' } }
  },
  parseHTML() { return [{ tag: 'span[data-phrase]' }] },
  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { class: 'saved-phrase', 'data-phrase': HTMLAttributes.phrase || '' }), 0]
  },
})

const JapaneseRuby = Node.create({
  name: 'japaneseRuby',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      base: { default: '', parseHTML: element => element.getAttribute('data-base') || element.childNodes[0]?.textContent || '' },
      reading: { default: '', parseHTML: element => element.getAttribute('data-reading') || element.querySelector('rt')?.textContent || '' },
      pitch: { default: null, parseHTML: element => element.getAttribute('data-pitch') },
    }
  },
  parseHTML() { return [{ tag: 'ruby[data-reading]' }] },
  renderHTML({ HTMLAttributes }) {
    const { base, reading, pitch } = HTMLAttributes
    return ['ruby', { 'data-base': base, 'data-reading': reading, 'data-pitch': pitch ?? '' }, String(base || ''), ['rt', {}, String(reading || '')]]
  },
})

const Indent = Extension.create({
  name: 'indent',
  addGlobalAttributes() {
    return [{
      types: ['paragraph', 'heading', 'blockquote'],
      attributes: {
        indent: {
          default: 0,
          parseHTML: element => Math.max(0, Math.min(6, Math.round((parseFloat(element.style.marginLeft) || 0) / 2))),
          renderHTML: ({ indent }) => Number(indent) > 0 ? { style: `margin-left: ${Number(indent) * 2}em` } : {},
        },
      },
    }]
  },
})

export function createEditorAdapter({ host, mount, placeholder }) {
  let savedSelection = null
  let updateHandler = null
  let suppressUpdates = false

  const instance = new Editor({
    element: mount,
    editable: false,
    content: '',
    extensions: [
      StarterKit,
      Highlight.configure({ multicolor: true }),
      Placeholder.configure({ placeholder: () => placeholder(), showOnlyWhenEditable: true }),
      Subscript,
      Superscript,
      TableKit.configure({ table: { resizable: false } }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Annotation,
      JapaneseReading,
      InlineComment,
      PhraseCapture,
      JapaneseRuby,
      Indent,
    ],
    editorProps: {
      attributes: {
        class: 'tiptap',
        spellcheck: 'true',
        'aria-label': '文本编辑区',
      },
    },
    onUpdate() {
      if (!suppressUpdates) updateHandler?.()
    },
  })

  function chainAtSavedSelection() {
    let chain = instance.chain().focus()
    if (savedSelection) chain = chain.setTextSelection(savedSelection)
    return chain
  }

  function activeBlockType() {
    return ['paragraph', 'heading', 'blockquote'].find(type => instance.isActive(type)) || 'paragraph'
  }

  function adjustIndent(amount) {
    if (instance.isActive('listItem')) {
      return amount > 0
        ? chainAtSavedSelection().sinkListItem('listItem').run()
        : chainAtSavedSelection().liftListItem('listItem').run()
    }
    const type = activeBlockType()
    const current = Number(instance.getAttributes(type).indent) || 0
    return chainAtSavedSelection().updateAttributes(type, { indent: Math.max(0, Math.min(6, current + amount)) }).run()
  }

  const commands = {
    undo: () => instance.commands.undo(),
    redo: () => instance.commands.redo(),
    bold: () => chainAtSavedSelection().toggleBold().run(),
    italic: () => chainAtSavedSelection().toggleItalic().run(),
    underline: () => chainAtSavedSelection().toggleUnderline().run(),
    insertUnorderedList: () => chainAtSavedSelection().toggleBulletList().run(),
    insertOrderedList: () => chainAtSavedSelection().toggleOrderedList().run(),
    justifyLeft: () => chainAtSavedSelection().setTextAlign('left').run(),
    justifyCenter: () => chainAtSavedSelection().setTextAlign('center').run(),
    justifyRight: () => chainAtSavedSelection().setTextAlign('right').run(),
    indent: () => adjustIndent(1),
    outdent: () => adjustIndent(-1),
    superscript: () => chainAtSavedSelection().toggleSuperscript().run(),
    subscript: () => chainAtSavedSelection().toggleSubscript().run(),
    removeFormat: () => chainAtSavedSelection().unsetAllMarks().clearNodes().run(),
  }

  return {
    instance,
    onUpdate(handler) { updateHandler = handler },
    getHTML() { return instance.getHTML() },
    getText() { return instance.getText({ blockSeparator: '\n' }) },
    setContent(html = '') {
      suppressUpdates = true
      instance.commands.setContent(html || '', { emitUpdate: false })
      suppressUpdates = false
    },
    clear() { this.setContent('') },
    setEditable(editable) { instance.setEditable(Boolean(editable), false) },
    isEditable() { return instance.isEditable },
    focus(position = null) { position == null ? instance.commands.focus() : instance.commands.focus(position) },
    rememberSelection() {
      const { from, to } = instance.state.selection
      savedSelection = from === to ? null : { from, to }
      return savedSelection
    },
    rememberDOMSelection(selection) {
      if (!selection?.rangeCount || selection.isCollapsed) return null
      const range = selection.getRangeAt(0)
      try {
        const from = instance.view.posAtDOM(range.startContainer, range.startOffset)
        const to = instance.view.posAtDOM(range.endContainer, range.endOffset)
        savedSelection = from === to ? null : { from: Math.min(from, to), to: Math.max(from, to) }
      } catch {
        savedSelection = null
      }
      return savedSelection
    },
    clearRememberedSelection() { savedSelection = null },
    getSelectionText() {
      if (!savedSelection) return ''
      return instance.state.doc.textBetween(savedSelection.from, savedSelection.to, ' ').trim()
    },
    refreshPlaceholder() { instance.view.dispatch(instance.state.tr) },
    run(command) { return commands[command]?.() || false },
    setBlock(type) {
      if (type === 'p') return chainAtSavedSelection().setParagraph().run()
      if (type === 'blockquote') return chainAtSavedSelection().toggleBlockquote().run()
      if (type === 'h2' || type === 'h3') return chainAtSavedSelection().toggleHeading({ level: Number(type.slice(1)) }).run()
      if (type === 'pre') return chainAtSavedSelection().toggleCodeBlock().run()
      return false
    },
    setLink(href) { return chainAtSavedSelection().extendMarkRange('link').setLink({ href }).run() },
    insertHorizontalRule() { return chainAtSavedSelection().setHorizontalRule().run() },
    toggleHighlight(color = '#fbe6a9') { return chainAtSavedSelection().toggleHighlight({ color }).run() },
    insertTable() { return chainAtSavedSelection().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run() },
    addAnnotation(itemId, kind = 'phrase') {
      return chainAtSavedSelection().setMark('annotation', { itemId: String(itemId), kind }).run()
    },
    removeAnnotation(itemId) {
      const target = String(itemId)
      let transaction = instance.state.tr
      instance.state.doc.descendants((node, position) => {
        if (!node.isText) return
        node.marks.filter(mark => mark.type.name === 'annotation' && String(mark.attrs.itemId) === target)
          .forEach(mark => { transaction = transaction.removeMark(position, position + node.nodeSize, mark) })
      })
      if (!transaction.docChanged) return false
      instance.view.dispatch(transaction)
      return true
    },
    clearAnnotations() {
      let transaction = instance.state.tr
      instance.state.doc.descendants((node, position) => {
        if (!node.isText) return
        node.marks.filter(mark => mark.type.name === 'annotation')
          .forEach(mark => { transaction = transaction.removeMark(position, position + node.nodeSize, mark) })
      })
      if (transaction.docChanged) instance.view.dispatch(transaction)
    },
    addInlineComment(comment) {
      if (!savedSelection || !String(comment || '').trim()) return false
      return chainAtSavedSelection().setMark('inlineComment', { comment: String(comment).trim() }).run()
    },
    addPhraseCapture() {
      const phrase = this.getSelectionText()
      if (!phrase) return false
      return chainAtSavedSelection().setMark('phraseCapture', { phrase }).run()
    },
    insertJapaneseReading(text) {
      if (!savedSelection) return false
      return instance.chain().focus().setTextSelection(savedSelection.to).insertContent({
        type: 'text',
        text,
        marks: [{ type: 'japaneseReading' }],
      }).run()
    },
    insertJapaneseRuby(base, reading, pitch = null) {
      if (!savedSelection || !String(base || '').trim() || !String(reading || '').trim()) return false
      return instance.chain().focus().setTextSelection(savedSelection).insertContent({
        type: 'japaneseRuby',
        attrs: { base: String(base).trim(), reading: String(reading).trim(), pitch },
      }).run()
    },
    host,
  }
}
