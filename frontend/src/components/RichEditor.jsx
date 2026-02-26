import { useEditor, EditorContent } from "@tiptap/react";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { forwardRef, useImperativeHandle, useState, useEffect, useRef } from "react";

// ─── Convert plain text / markdown to TipTap HTML ────────────────────────────

function toHtml(content) {
  if (!content) return "";
  // If it already looks like HTML, return as-is
  if (/<[a-zA-Z][^>]*>/.test(content)) return content;
  // Convert plain text: double newlines → paragraph breaks, # headers → headings
  const blocks = content.split(/\n{2,}/);
  const html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Single-line heading
      const hMatch = trimmed.match(/^(#{1,6})\s+(.+)$/);
      if (hMatch) {
        return `<h${hMatch[1].length}>${hMatch[2]}</h${hMatch[1].length}>`;
      }
      // Paragraph (single newlines → <br>)
      const inner = trimmed.split("\n").join("<br>");
      return `<p>${inner}</p>`;
    })
    .filter(Boolean)
    .join("");
  return html || "<p></p>";
}

// ─── Extract TipTap headings for the outline panel ───────────────────────────

export function extractTiptapHeaders(editor) {
  if (!editor) return [];
  const headers = [];
  editor.state.doc.forEach((node, offset) => {
    if (node.type.name === "heading") {
      headers.push({
        level: node.attrs.level,
        text: node.textContent || "(blank)",
        pos: offset + 1, // position inside the heading node
      });
    }
  });
  return headers;
}

// ─── Toolbar building blocks ──────────────────────────────────────────────────

function ToolBtn({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 28,
        height: 28,
        padding: "0 5px",
        fontSize: 13,
        fontWeight: 600,
        border: "none",
        borderRadius: 4,
        cursor: "pointer",
        background: active ? "#e8e8e8" : "transparent",
        color: active ? "#111" : "#555",
        transition: "background 0.1s",
        fontFamily: "inherit",
        userSelect: "none",
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = "#f2f2f2";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? "#e8e8e8" : "transparent";
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div
      style={{
        width: 1,
        height: 18,
        background: "#ddd",
        margin: "0 3px",
        flexShrink: 0,
      }}
    />
  );
}

// ─── RichEditor ───────────────────────────────────────────────────────────────

const redactPluginKey = new PluginKey("redact-letters");
const collapsibleHeadingKey = new PluginKey("collapsible-headings");

function isCollapsedAttr(value) {
  return value === true || value === "true";
}

function buildRedactionDecorations(doc, allowHeaders) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;
    if (allowHeaders) {
      const parent = doc.resolve(pos).parent;
      if (parent && parent.type.name === "heading") return;
    }
    const text = node.text;
    let match;
    const regex = /[A-Za-z]+/g;
    while ((match = regex.exec(text)) !== null) {
      const from = pos + match.index;
      const to = from + match[0].length;
      decorations.push(Decoration.inline(from, to, { class: "redact-letter" }));
    }
  });
  return DecorationSet.create(doc, decorations);
}

function createRedactionExtension(settingsRef) {
  return Extension.create({
    name: "redactLetters",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: redactPluginKey,
          state: {
            init: (_, state) => {
              const settings = settingsRef.current;
              if (!settings.enabled) {
                return { deco: DecorationSet.empty, version: settings.version };
              }
              return {
                deco: buildRedactionDecorations(state.doc, settings.allowHeaders),
                version: settings.version,
              };
            },
            apply: (tr, value, _oldState, newState) => {
              const settings = settingsRef.current;
              const needsRebuild = tr.docChanged || settings.version !== value.version;
              if (!needsRebuild) return value;
              if (!settings.enabled) {
                return { deco: DecorationSet.empty, version: settings.version };
              }
              return {
                deco: buildRedactionDecorations(newState.doc, settings.allowHeaders),
                version: settings.version,
              };
            },
          },
          props: {
            decorations(state) {
              return this.getState(state).deco;
            },
          },
        }),
      ];
    },
  });
}

function toggleHeadingCollapsed(view, pos) {
  const node = view.state.doc.nodeAt(pos);
  if (!node || node.type.name !== "heading") return;
  const collapsed = isCollapsedAttr(node.attrs.collapsed);
  const nextAttrs = { ...node.attrs, collapsed: !collapsed };
  const tr = view.state.tr.setNodeMarkup(pos, undefined, nextAttrs);
  view.dispatch(tr);
  view.focus();
}

function buildCollapsibleDecorations(doc) {
  const decorations = [];
  const headings = [];

  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      headings.push({ node, pos });
    }
  });

  for (let i = 0; i < headings.length; i += 1) {
    const { node, pos } = headings[i];
    const collapsed = isCollapsedAttr(node.attrs.collapsed);

    const widget = Decoration.widget(
      pos + 1,
      (view) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `heading-toggle${collapsed ? " is-collapsed" : ""}`;
        btn.setAttribute(
          "aria-label",
          collapsed ? "Expand section" : "Collapse section"
        );
        btn.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
        });
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleHeadingCollapsed(view, pos);
        });
        return btn;
      },
      { side: -1 }
    );
    decorations.push(widget);
  }

  const headingStack = [];

  doc.descendants((node, pos, parent) => {
    if (!node.isBlock) return;
    if (parent !== doc) return; // only direct children of the document

    if (node.type.name === "heading") {
      const anyCollapsed = headingStack.some((entry) => entry.collapsed);
      if (anyCollapsed) {
        decorations.push(
          Decoration.node(pos, pos + node.nodeSize, {
            class: "heading-collapsed-block",
          })
        );
      }
      const level = node.attrs.level || 1;
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, collapsed: isCollapsedAttr(node.attrs.collapsed) });
      return false;
    }

    if (headingStack.length === 0) return;
    const anyCollapsed = headingStack.some((entry) => entry.collapsed);
    if (anyCollapsed) {
      decorations.push(
        Decoration.node(pos, pos + node.nodeSize, {
          class: "heading-collapsed-block",
        })
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

const CollapsibleHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      collapsed: {
        default: false,
        rendered: false,
      },
    };
  },
});

const CollapsibleHeadingDecorations = Extension.create({
  name: "collapsibleHeadings",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: collapsibleHeadingKey,
        state: {
          init: (_config, state) => buildCollapsibleDecorations(state.doc),
          apply: (tr, value, _oldState, newState) => {
            if (!tr.docChanged && !tr.getMeta(collapsibleHeadingKey)) return value;
            return buildCollapsibleDecorations(newState.doc);
          },
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
        },
      }),
    ];
  },
});

const RichEditor = forwardRef(function RichEditor(
  { initialContent, onChange, onReady, placeholder, autoFocus, style, redactText, dontRedactHeaders },
  ref
) {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const redactionSettingsRef = useRef({
    enabled: !!redactText,
    allowHeaders: !!dontRedactHeaders,
    version: 0,
  });

  // Keep latest callbacks in refs so TipTap's stale closure always calls current versions
  const onChangeRef = useRef(onChange);
  const onReadyRef = useRef(onReady);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onReadyRef.current = onReady; }, [onReady]);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
      }),
      CollapsibleHeading,
      CollapsibleHeadingDecorations,
      createRedactionExtension(redactionSettingsRef),
      Link.configure({
        openOnClick: false,
        autolink: true,
        // When text is selected and a URL is pasted, wraps selection as hyperlink
        linkOnPaste: true,
        HTMLAttributes: {
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder: placeholder || "Start writing…",
      }),
    ],
    content: toHtml(initialContent),
    autofocus: autoFocus ? "start" : false,
    onCreate({ editor }) {
      onReadyRef.current?.(editor);
    },
    onUpdate({ editor }) {
      const html = editor.getHTML();
      const text = editor.getText({ blockSeparator: "\n" });
      onChangeRef.current?.(html, text);
    },
  });

  useEffect(() => {
    const nextEnabled = !!redactText;
    const nextAllowHeaders = !!dontRedactHeaders;
    const settings = redactionSettingsRef.current;
    if (settings.enabled !== nextEnabled || settings.allowHeaders !== nextAllowHeaders) {
      redactionSettingsRef.current = {
        enabled: nextEnabled,
        allowHeaders: nextAllowHeaders,
        version: settings.version + 1,
      };
      editor?.view?.dispatch(editor.state.tr);
    }
  }, [redactText, dontRedactHeaders, editor]);

  // Expose imperative API to parent via ref
  useImperativeHandle(ref, () => ({
    getHTML: () => editor?.getHTML() ?? "",
    getText: () => editor?.getText({ blockSeparator: "\n" }) ?? "",
    getEditor: () => editor,
    clearContent: () => {
      editor?.commands.clearContent();
    },
    focus: () => editor?.commands.focus(),
  }));

  // ── Ctrl+K → open link dialog ─────────────────────────────────────────────
  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      openLinkDialog();
    }
  }

  // ── Link dialog helpers ───────────────────────────────────────────────────
  function openLinkDialog() {
    if (!editor) return;
    const existingHref = editor.getAttributes("link").href || "";
    setLinkUrl(existingHref);
    setShowLinkInput(true);
  }

  function applyLink() {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href })
        .run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    setShowLinkInput(false);
    setLinkUrl("");
  }

  function closeLinkDialog() {
    setShowLinkInput(false);
    setLinkUrl("");
    editor?.commands.focus();
  }

  if (!editor) return null;

  const isLinkActive = editor.isActive("link");

  return (
    <div
      onKeyDown={handleKeyDown}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        height: "100%",
        overflow: "hidden",
        position: "relative",
        ...style,
      }}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 2,
          padding: "5px 10px",
          borderBottom: "1px solid #eee",
          background: "#fafafa",
          flexShrink: 0,
          userSelect: "none",
        }}
      >
        {/* Heading levels */}
        <ToolBtn
          title="Heading 1"
          active={editor.isActive("heading", { level: 1 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
        >
          H1
        </ToolBtn>
        <ToolBtn
          title="Heading 2"
          active={editor.isActive("heading", { level: 2 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
        >
          H2
        </ToolBtn>
        <ToolBtn
          title="Heading 3"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
        >
          H3
        </ToolBtn>

        <Divider />

        {/* Text formatting */}
        <ToolBtn
          title="Bold (Ctrl+B)"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </ToolBtn>
        <ToolBtn
          title="Italic (Ctrl+I)"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em style={{ fontStyle: "italic" }}>I</em>
        </ToolBtn>
        <ToolBtn
          title="Underline (Ctrl+U)"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <span style={{ textDecoration: "underline" }}>U</span>
        </ToolBtn>
        <ToolBtn
          title="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <span style={{ textDecoration: "line-through" }}>S</span>
        </ToolBtn>

        <Divider />

        {/* Link */}
        <ToolBtn
          title={isLinkActive ? "Edit link (Ctrl+K)" : "Insert link (Ctrl+K)"}
          active={isLinkActive}
          onClick={openLinkDialog}
        >
          {/* Chain link icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        </ToolBtn>

        <Divider />

        {/* Lists */}
        <ToolBtn
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          {/* Bullet list icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <circle cx="3" cy="5" r="1.5" />
            <rect x="7" y="4" width="11" height="2" rx="1" />
            <circle cx="3" cy="10" r="1.5" />
            <rect x="7" y="9" width="11" height="2" rx="1" />
            <circle cx="3" cy="15" r="1.5" />
            <rect x="7" y="14" width="11" height="2" rx="1" />
          </svg>
        </ToolBtn>
        <ToolBtn
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          {/* Ordered list icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <text x="0" y="7.5" fontSize="6.5" fontWeight="bold">
              1.
            </text>
            <rect x="7" y="4" width="11" height="2" rx="1" />
            <text x="0" y="12.5" fontSize="6.5" fontWeight="bold">
              2.
            </text>
            <rect x="7" y="9" width="11" height="2" rx="1" />
            <text x="0" y="17.5" fontSize="6.5" fontWeight="bold">
              3.
            </text>
            <rect x="7" y="14" width="11" height="2" rx="1" />
          </svg>
        </ToolBtn>

        <Divider />

        {/* Blockquote */}
        <ToolBtn
          title="Blockquote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          {/* Quote icon */}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="none"
          >
            <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
          </svg>
        </ToolBtn>
      </div>

      {/* ── Link popup ───────────────────────────────────────────────────── */}
      {showLinkInput && (
        <div
          style={{
            position: "absolute",
            top: 46,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: 8,
            padding: "10px 14px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.13)",
            zIndex: 200,
            display: "flex",
            gap: 8,
            alignItems: "center",
            minWidth: 340,
          }}
        >
          <input
            autoFocus
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") closeLinkDialog();
            }}
            placeholder="https://…"
            style={{
              flex: 1,
              border: "1px solid #ddd",
              borderRadius: 5,
              padding: "6px 10px",
              fontSize: 13,
              outline: "none",
              fontFamily: "inherit",
            }}
          />
          <button
            type="button"
            onClick={applyLink}
            style={{
              padding: "6px 12px",
              fontSize: 13,
              fontWeight: 600,
              background: "#111",
              color: "#fff",
              border: "none",
              borderRadius: 5,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
          {isLinkActive && (
            <button
              type="button"
              onClick={removeLink}
              style={{
                padding: "6px 10px",
                fontSize: 13,
                color: "#666",
                background: "transparent",
                border: "1px solid #ddd",
                borderRadius: 5,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          )}
          <button
            type="button"
            onClick={closeLinkDialog}
            style={{
              padding: "4px 6px",
              fontSize: 15,
              color: "#aaa",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Editor content ───────────────────────────────────────────────── */}
      <EditorContent editor={editor} className="rich-editor-scroll" />
    </div>
  );
});

export default RichEditor;
