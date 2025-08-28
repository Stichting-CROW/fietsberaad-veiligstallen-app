import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { PlainTextPlugin } from '@lexical/react/LexicalPlainTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { AutoFocusPlugin } from '@lexical/react/LexicalAutoFocusPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $generateHtmlFromNodes } from '@lexical/html';
import { useEffect } from 'react';
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
    // editorState: (editor: LexicalEditor) => {
    //   const root = $getRoot();
    //   if (root.getTextContentSize() === 0) {
    //     const parser = new DOMParser();
    //     const dom = parser.parseFromString(value, 'text/html');
    //     const nodes = $generateNodesFromDOM(editor, dom);
    //     root.append(...nodes);
    //   }
    // },
  };

  return (
    <div className={`${styles.richTextEditor} ${className}`}>
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

export default PlainTextEditor; 