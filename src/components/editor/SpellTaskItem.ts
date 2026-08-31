import { mergeAttributes } from "@tiptap/core";
import TaskItem from "@tiptap/extension-task-item";
import {
  CHECK_LONG_PATH,
  CHECK_SHORT_PATH,
  paintCheckmark,
} from "../ui/StateIcon";

function checkPath(className: string, d: string, checked: boolean) {
  return [
    "path",
    {
      class: className,
      d,
      fill: "none",
      stroke: "currentColor",
      "stroke-width": "3",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
      pathLength: "1",
      "stroke-dasharray": "1",
      "stroke-dashoffset": checked ? "0" : "1",
    },
  ] as const;
}

function checkSvg(checked: boolean) {
  return [
    "svg",
    {
      viewBox: "0 0 24 24",
      fill: "none",
      class: "state-checkmark-svg",
      "aria-hidden": "true",
    },
    checkPath("state-checkmark-short", CHECK_SHORT_PATH, checked),
    checkPath("state-checkmark-long", CHECK_LONG_PATH, checked),
  ] as const;
}

function isPrimaryPointer(event: Event) {
  return !("button" in event) || (event as PointerEvent).button === 0;
}

export const SpellTaskItem = TaskItem.extend({
  renderHTML({ node, HTMLAttributes }) {
    return [
      "li",
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        "data-type": this.name,
      }),
      [
        "label",
        [
          "input",
          {
            type: "checkbox",
            checked: node.attrs.checked ? "checked" : null,
          },
        ],
        [
          "span",
          {
            class: "state-checkmark",
            "data-state": node.attrs.checked ? "checked" : "unchecked",
          },
          checkSvg(Boolean(node.attrs.checked)),
        ],
      ],
      ["div", 0],
    ];
  },

  addNodeView() {
    const createView = this.parent?.();
    const typeName = this.name;
    return (props) => {
      const view = createView!(props);
      const { editor, getPos } = props;
      const label = view.dom.querySelector("label");
      const span = view.dom.querySelector("label > span");
      const checkbox = view.dom.querySelector("input[type=checkbox]");

      const paint = (checked: boolean, animate: boolean) => {
        if (span instanceof HTMLElement) paintCheckmark(span, checked, animate);
        if (checkbox instanceof HTMLInputElement) checkbox.checked = checked;
        if (view.dom instanceof HTMLElement) view.dom.dataset.checked = String(checked);
      };
      paint(Boolean(props.node.attrs.checked), false);

      const toggle = () => {
        if (!editor.isEditable) return;
        const pos = typeof getPos === "function" ? getPos() : null;
        if (typeof pos !== "number") return;
        const currentNode = editor.state.doc.nodeAt(pos);
        const next = !currentNode?.attrs.checked;
        paint(Boolean(next), true);
        editor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .command(({ tr }) => {
            tr.setNodeMarkup(pos, undefined, {
              ...currentNode?.attrs,
              checked: next,
            });
            return true;
          })
          .run();
      };

      // WebKitGTK (Tauri on Linux) does not toggle native checkboxes after
      // TipTap's mousedown preventDefault, and the checkmark SVG can steal
      // the hit. Toggle from the label instead.
      const onPointerDown = (event: Event) => {
        if (!isPrimaryPointer(event)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        toggle();
      };
      const onClick = (event: Event) => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };

      label?.addEventListener("pointerdown", onPointerDown);
      label?.addEventListener("click", onClick);

      const update = view.update;
      const ignoreMutation = view.ignoreMutation;
      return {
        ...view,
        // ProseMirror treats SVG dashoffset writes as document mutations and
        // redraws the task item, which remounts the check and kills the draw
        // animation. Ignore chrome outside the editable text.
        ignoreMutation: (mutation) => {
          if (mutation.type === "selection") {
            return ignoreMutation?.(mutation) ?? false;
          }
          const target = mutation.target;
          if (target instanceof Node && view.contentDOM?.contains(target)) {
            return ignoreMutation?.(mutation) ?? false;
          }
          return true;
        },
        update: (updatedNode, decorations, innerDecorations) => {
          if (updatedNode.type.name !== typeName) return false;
          update?.(updatedNode, decorations, innerDecorations);
          paint(Boolean(updatedNode.attrs.checked), true);
          return true;
        },
        destroy: () => {
          label?.removeEventListener("pointerdown", onPointerDown);
          label?.removeEventListener("click", onClick);
          view.destroy?.();
        },
      };
    };
  },
});
