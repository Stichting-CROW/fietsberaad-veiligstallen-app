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
import { useEffect } from 'react';
import styles from './RichTextEditor.module.css';
import Toolbar from './Toolbar';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  return <div className={styles.editorErrorBoundary}>{children}</div>;
};

const LINK_COMMAND = createCommand<string>('LINK');

// Plugin to handle link creation
const LinkCommandPlugin = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerCommand(
      LINK_COMMAND,
      (payload) => {
        const selection = $getSelection();
        if ($isRangeSelection(selection)) {
          const url = payload;
          if (url) {
            // Ensure URL has protocol
            const urlWithProtocol = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') || url.startsWith('tel:')
              ? url 
              : `https://${url}`;
            
            editor.dispatchCommand(TOGGLE_LINK_COMMAND, urlWithProtocol);
          }
        }
        return true;
      },
      0
    );
  }, [editor]);

  return null;
};

const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
}) => {
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
        const dom = parser.parseFromString(value, 'text/html');
        const nodes = $generateNodesFromDOM(editor, dom);
        root.append(...nodes);
      }
    },
  };

  return (
    <div className={`${styles.richTextEditor} ${className}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <div className={styles.editorContainer}>
          <Toolbar />
          <RichTextPlugin
            contentEditable={<ContentEditable className={styles.editorInput} />}
            placeholder={<div className={styles.editorPlaceholder}>{placeholder}</div>}
            ErrorBoundary={ErrorBoundary}
          />
          <HistoryPlugin />
          <AutoFocusPlugin />
          <ListPlugin />
          <LinkPlugin validateUrl={(url) => {
            try {
              new URL(url);
              return true;
            } catch {
              return false;
            }
          }} />
          <LinkCommandPlugin />
          <MarkdownShortcutPlugin transformers={TRANSFORMERS} />
          <OnChangePlugin onChange={onChange} />
        </div>
      </LexicalComposer>
    </div>
  );
};

// Plugin to handle changes and convert to HTML
const OnChangePlugin = ({ onChange }: { onChange: (value: string) => void }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const htmlString = $generateHtmlFromNodes(editor);
        onChange(htmlString);
      });
    });
  }, [editor, onChange]);

  return null;
};

export default RichTextEditor; 