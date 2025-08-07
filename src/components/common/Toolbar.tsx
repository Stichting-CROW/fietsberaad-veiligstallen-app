import { 
  $getSelection, 
  $isRangeSelection, 
  FORMAT_TEXT_COMMAND, 
  LexicalEditor, 
  UNDO_COMMAND, 
  REDO_COMMAND, 
  createCommand,
  FORMAT_ELEMENT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { mergeRegister } from '@lexical/utils';

import styles from './RichTextEditor.module.css';
import { useState, useCallback, useEffect } from 'react';

const Divider = () => {
  return <div className={styles.divider} />;
};

const LINK_COMMAND = createCommand('LINK');
const LowPriority = 1;

const Toolbar = () => {
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [isStrikethrough, setIsStrikethrough] = useState(false);
  const [editor] = useLexicalComposerContext();

  const $updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'));
      setIsItalic(selection.hasFormat('italic'));
      setIsUnderline(selection.hasFormat('underline'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
    }
  }, []);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({editorState}) => {
        editorState.read(() => {
          $updateToolbar();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        (_payload, _newEditor) => {
          $updateToolbar();
          return false;
        },
        LowPriority,
      ),
      editor.registerCommand(
        CAN_UNDO_COMMAND,
        (payload) => {
          setCanUndo(payload);
          return false;
        },
        LowPriority,
      ),
      editor.registerCommand(
        CAN_REDO_COMMAND,
        (payload) => {
          setCanRedo(payload);
          return false;
        },
        LowPriority,
      ),
    );
  }, [editor, $updateToolbar]);

  return (
    <div className={styles.toolbar}>
      <button
        disabled={!canUndo}
        onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)}
        className={`${styles.toolbarItem} ${styles.spaced}`}
        type="button"
        aria-label="Undo"
      >
        <i className={`${styles['format']} ${styles['format-undo']}`} />
      </button>
      <button
        disabled={!canRedo}
        onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)}
        className={styles.toolbarItem}
        type="button"
        aria-label="Redo"
      >
        <i className={`${styles['format']} ${styles['format-redo']}`} />
      </button>
      <Divider />
      <button
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}
        className={`${styles.toolbarItem} ${styles.spaced} ${isBold ? styles.active : ''}`}
        type="button"
        aria-label="Format Bold"
      >
        <i className={`${styles['format']} ${styles['format-bold']}`} />
      </button>
      <button
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic')}
        className={`${styles.toolbarItem} ${styles.spaced} ${isItalic ? styles.active : ''}`}
        type="button"
        aria-label="Format Italics"
      >
        <i className={`${styles['format']} ${styles['format-italic']}`} />
      </button>
      <button
        onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline')}
        className={`${styles.toolbarItem} ${styles.spaced} ${isUnderline ? styles.active : ''}`}
        type="button"
        aria-label="Format Underline"
      >
        <i className={`${styles['format']} ${styles['format-underline']}`} />
      </button>
      <Divider />
      {/* <button
        onClick={() => {
          const url = prompt('Enter URL:');
          if (url) {
            editor.dispatchCommand(LINK_COMMAND, url);
          }
        }}
        className={`${styles.toolbarItem} ${styles.spaced}`}
        type="button"
        aria-label="Insert Link"
      >
        <i className={`${styles['format']} ${styles['format-link']}`} />
      </button> */}
      <button
        onClick={() => editor.dispatchCommand(INSERT_UNORDERED_LIST_COMMAND, undefined)}
        className={styles.toolbarItem}
        type="button"
        aria-label="Insert Unordered List"
      >
        <i className={`${styles['format']} ${styles['format-list']}`} />
      </button>
    </div>
  );
};

export default Toolbar;