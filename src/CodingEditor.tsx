import Editor, { loader, type EditorProps } from "@monaco-editor/react";
import { useTheme } from "./theme";
import * as monaco from "monaco-editor/editor/editor.api";
import "monaco-editor/languages/definitions/python/register";
import "monaco-editor/languages/definitions/java/register";
import "monaco-editor/languages/definitions/javascript/register";
import "monaco-editor/languages/definitions/cpp/register";
import EditorWorker from "monaco-editor/editor/editor.worker?worker";
globalThis.MonacoEnvironment = { getWorker: () => new EditorWorker() };
loader.config({ monaco });
monaco.editor.defineTheme("hirelens-light", {
  base: "vs",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#ffffff",
    "editor.foreground": "#26231f",
    "editorLineNumber.foreground": "#797168",
    "editor.lineHighlightBackground": "#f8f5ef",
    "editor.selectionBackground": "#f5d8b9",
    "editorCursor.foreground": "#aa4f18",
  },
});
monaco.editor.defineTheme("hirelens-dark", {
  base: "vs-dark",
  inherit: true,
  rules: [],
  colors: {
    "editor.background": "#211e19",
    "editor.foreground": "#f4eee5",
    "editorLineNumber.foreground": "#a99f90",
    "editor.lineHighlightBackground": "#2b2720",
    "editor.selectionBackground": "#705126",
    "editorCursor.foreground": "#f1b65b",
  },
});
export default function CodingEditor(props: EditorProps) {
  const { theme } = useTheme();
  return <Editor {...props} theme={`hirelens-${theme}`} />;
}
