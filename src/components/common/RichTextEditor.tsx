import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
// import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
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
import { $getRoot, type LexicalEditor, $getSelection, $isRangeSelection } from 'lexical';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { useEffect, useState } from 'react';
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
      if (root.getTextContentSize() === 0 && value) {
        const parser = new DOMParser();
        const htmlToParse = value || '';
        const dom = parser.parseFromString(htmlToParse, 'text/html');
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
          <OnChangePlugin onChange={onChange} />
          <ValueUpdatePlugin value={value} />
          <HtmlPastePlugin />
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

// Plugin to handle external value updates
const ValueUpdatePlugin = ({ value }: { value: string }) => {
  const [editor] = useLexicalComposerContext();
  const [lastValue, setLastValue] = useState<string | null>(null);

  useEffect(() => {
    if (value !== undefined && value !== lastValue) {
      editor.update(() => {
        const root = $getRoot();
        const currentHtml = $generateHtmlFromNodes(editor);
        
        // Only update if the value is actually different to prevent infinite loops
        if (currentHtml !== value) {
          root.clear();
          if (value) {
            const parser = new DOMParser();
            const dom = parser.parseFromString(value, 'text/html');
            const nodes = $generateNodesFromDOM(editor, dom);
            root.append(...nodes);
          }
          setLastValue(value);
        }
      });
    }
  }, [editor, value, lastValue]);

  return null;
};

// Plugin to detect HTML paste and insert formatted HTML
const HtmlPastePlugin = () => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    // Handle native paste event on the editor element
    const handlePaste = (event: ClipboardEvent) => {
      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      // First check if HTML is available in clipboard
      let htmlData = clipboardData.getData('text/html');
      let textData = clipboardData.getData('text/plain');

      // If no HTML in clipboard, check if plain text contains HTML tags
      // This handles cases where HTML is copied from PDFs or other sources
      // that don't preserve HTML format in clipboard
      if (!htmlData || htmlData.trim().length === 0) {
        if (textData && textData.trim().length > 0) {
          // Check if plain text contains HTML tags
          const hasHtmlTags = /<[a-z][\s\S]*>/i.test(textData);
          if (hasHtmlTags) {
            htmlData = textData; // Use plain text as HTML source
          }
        }
      }

      // If HTML is available and looks like actual HTML (not just plain text)
      if (htmlData && htmlData.trim().length > 0) {
        // Check if it's actual HTML (contains tags) or just plain text
        const hasHtmlTags = /<[a-z][\s\S]*>/i.test(htmlData);
        
        if (hasHtmlTags) {
          event.preventDefault();
          event.stopPropagation();
          
          editor.update(() => {
            const selection = $getSelection();
            const parser = new DOMParser();
            const dom = parser.parseFromString(htmlData, 'text/html');
            const nodes = $generateNodesFromDOM(editor, dom);
            
            if ($isRangeSelection(selection)) {
              // Insert nodes at selection, replacing selected content
              selection.insertNodes(nodes);
            } else {
              // No selection, insert at root
              const root = $getRoot();
              root.append(...nodes);
            }
          });
        }
      }
    };

    // Get the editor element and attach paste listener
    const editorElement = editor.getRootElement();
    if (editorElement) {
      editorElement.addEventListener('paste', handlePaste, true); // Use capture phase
      return () => {
        editorElement.removeEventListener('paste', handlePaste, true);
      };
    }
  }, [editor]);

  return null;
};

export default RichTextEditor; 