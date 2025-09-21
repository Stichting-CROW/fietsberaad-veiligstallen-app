import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $generateHtmlFromNodes } from '@lexical/html';
import { $getRoot, $createParagraphNode, $createTextNode } from 'lexical';
import { useEffect, useState } from 'react';
import styles from './RichTextEditor.module.css'; // share styles with RichTextEditor
import Toolbar from './Toolbar';
interface PlainTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

const ErrorBoundary = ({ children }: { children: React.ReactNode }) => {
  return <div className={styles.editorErrorBoundary}>{children}</div>;
};

const PlainTextEditor: React.FC<PlainTextEditorProps> = ({
  value,
  onChange,
  placeholder,
  className = '',
}) => {
  const initialConfig = {
    namespace: 'PlainTextEditor',
    onError: (error: Error) => {
      console.error(error);
    },
    editorState: (editor: any) => {
      const root = $getRoot();
      if (root.getTextContentSize() === 0 && value) {
        const paragraph = $createParagraphNode();
        const textNode = $createTextNode(value);
        paragraph.append(textNode);
        root.append(paragraph);
      }
    },
  };

  return (
    <div className={`${styles.richTextEditor} ${styles.plainTextEditor} ${className}`}>
      <LexicalComposer initialConfig={initialConfig}>
        <div className={styles.editorContainer}>
          <PlainTextPlugin
            contentEditable={<ContentEditable className={styles.editorInput} />}
            placeholder={<div className={styles.editorPlaceholder}>{placeholder}</div>}
            ErrorBoundary={ErrorBoundary}
          />
          <HistoryPlugin />
          {/* <AutoFocusPlugin /> */}
          <OnChangePlugin onChange={onChange} />
          <ValueUpdatePlugin value={value} />
        </div>
      </LexicalComposer>
    </div>
  );
};

// Plugin to handle changes and convert to plain text
const OnChangePlugin = ({ onChange }: { onChange: (value: string) => void }) => {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState, dirtyElements, dirtyLeaves }) => {
      // Only trigger onChange if there are actual changes
      if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
        editorState.read(() => {
          const root = $getRoot();
          const plainText = root.getTextContent();
          onChange(plainText);
        });
      }
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
        const currentText = root.getTextContent();
        
        // Only update if the value is actually different to prevent infinite loops
        if (currentText !== value) {
          root.clear();
          if (value) {
            const paragraph = $createParagraphNode();
            const textNode = $createTextNode(value);
            paragraph.append(textNode);
            root.append(paragraph);
          }
          setLastValue(value);
        }
      });
    }
  }, [editor, value, lastValue]);

  return null;
};

export default PlainTextEditor; 