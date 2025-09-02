import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { TableCellNode, TableNode, TableRowNode } from '@lexical/table';
import { ListItemNode, ListNode, INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { CodeHighlightNode, CodeNode } from '@lexical/code';
import { AutoLinkNode, LinkNode, TOGGLE_LINK_COMMAND } from '@lexical/link';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TRANSFORMERS } from '@lexical/markdown';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot, type LexicalEditor, $getSelection, $isRangeSelection, createCommand } from 'lexical';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { useEffect, useState } from 'react';
import styles from './RichTextEditor.module.css';
import Toolbar from './Toolbar';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  showToggleRaw?: boolean;
}

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  return <div className={styles.editorErrorBoundary}>{children}</div>;
};



const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
  showToggleRaw = false,
}) => {
  const [isRawView, setIsRawView] = useState(false);
  const [rawHtml, setRawHtml] = useState(value);
  const [editorKey, setEditorKey] = useState(0); // Force re-render of LexicalComposer

  const initialConfig = {
    namespace: 'RichTextEditor',
    onError: (error: Error) => {
      console.error(error);
    },
    nodes: [
      HeadingNode,
      ListNode,
      ListItemNode,
      QuoteNode,
      CodeNode,
      CodeHighlightNode,
      TableNode,
      TableCellNode,
      TableRowNode,
      AutoLinkNode,
      LinkNode,
    ],
    editorState: (editor: LexicalEditor) => {
      const root = $getRoot();
      if (root.getTextContentSize() === 0) {
        const parser = new DOMParser();
        // Use rawHtml if we're switching back from raw mode, otherwise use the original value
        const htmlToParse = rawHtml;
        const dom = parser.parseFromString(htmlToParse, 'text/html');
        const nodes = $generateNodesFromDOM(editor, dom);
        root.append(...nodes);
      }
    },
  };

  return (
    <div className={`${styles.richTextEditor} ${className}`}>
      <LexicalComposer key={editorKey} initialConfig={initialConfig}>
        <div className={styles.editorContainer}>
          <Toolbar 
            onToggleRawView={() => {
              if (isRawView) {
                // Switching from raw to formatted mode - update editor with new content
                setEditorKey(prev => prev + 1);
              }
              setIsRawView(!isRawView);
            }}
            isRawView={isRawView}
            showToggleRaw={showToggleRaw}
          />
          {isRawView ? (
            <div className={styles.rawViewContainer}>
              <textarea
                className={styles.rawHtmlInput}
                value={rawHtml}
                onChange={(e) => {
                  setRawHtml(e.target.value);
                  onChange(e.target.value);
                }}
                placeholder="Enter HTML code here..."
              />
            </div>
          ) : (
            <>
              <RichTextPlugin
                contentEditable={<ContentEditable className={styles.editorInput} />}
                placeholder={<div className={styles.editorPlaceholder}>{placeholder}</div>}
                ErrorBoundary={ErrorBoundary}
              />
              <HistoryPlugin />
              {/* <AutoFocusPlugin /> */}
              <ListPlugin />
              <LinkPlugin validateUrl={(url) => {
                try {
                  new URL(url);
                  return true;
                } catch {
                  return false;
                }
              }} />
              <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
              <OnChangePlugin onChange={onChange} onRawHtmlUpdate={setRawHtml} />
            </>
          )}
        </div>
      </LexicalComposer>
    </div>
  );
};

// Plugin to handle changes and convert to HTML
const OnChangePlugin = ({ onChange, onRawHtmlUpdate }: { onChange: (value: string) => void; onRawHtmlUpdate: (value: string) => void }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const htmlString = $generateHtmlFromNodes(editor);
        onChange(htmlString);
        onRawHtmlUpdate(htmlString);
      });
    });
  }, [editor, onChange, onRawHtmlUpdate]);

  return null;
};

export default RichTextEditor; 