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
  CAN_REDO_COMMAND,
  $getRoot
} from 'lexical';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { INSERT_UNORDERED_LIST_COMMAND } from '@lexical/list';
import { LinkPlugin } from '@lexical/react/LexicalLinkPlugin';
import { mergeRegister } from '@lexical/utils';
import { TOGGLE_LINK_COMMAND, LinkNode } from '@lexical/link';
import { $generateHtmlFromNodes } from '@lexical/html';

import styles from './RichTextEditor.module.css';
import { useState, useCallback, useEffect } from 'react';

const Divider = () => {
  return <div className={styles.divider} />;
};

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
      <button
        onClick={() => {
          console.log('Link button clicked');
          
          let hasSelection = false;
          let selectedText = '';
          let currentUrl = '';
          let isLink = false;
          
          // Use editor.read() to safely check the selection and link status
          editor.read(() => {
            const selection = $getSelection();
            if ($isRangeSelection(selection)) {
              hasSelection = true;
              selectedText = selection.getTextContent();
              console.log('Selection found:', selectedText);
              
              // Check if the selection is already part of a link
              const anchorNode = selection.anchor.getNode();
              const focusNode = selection.focus.getNode();
              
              // Look for link nodes in the selection
              let linkNode: LinkNode | null = null;
              if (anchorNode.getParent()?.getType() === 'link') {
                linkNode = anchorNode.getParent() as LinkNode;
              } else if (focusNode.getParent()?.getType() === 'link') {
                linkNode = focusNode.getParent() as LinkNode;
              }
              
              if (linkNode) {
                isLink = true;
                currentUrl = linkNode.getURL();
                console.log('Selection is already a link with URL:', currentUrl);
              }
            } else {
              console.log('No valid selection found for link creation');
            }
          });
          
          // If we have a selection, proceed with link creation/editing
          if (hasSelection) {
            let promptText = 
              'Voer een URL (https://www.ergens.nl) of email link (mailto:iemand@ergens.nl) in:'

            if(isLink){
              promptText = promptText + `\n\nMaak de invoer leeg om de huidige koppeling te verwijderen`;
            }
            
            const url = prompt(promptText, isLink ? currentUrl : '');
            if (url !== null) { // Check for null (user cancelled) vs empty string
              console.log('URL entered:', url);
              
              if (url === '') {
                // Empty URL means remove the link
                console.log('Removing link');
                // Try to remove the link by dispatching TOGGLE_LINK_COMMAND with null
                // This should remove the link formatting while keeping the text
                console.log('Dispatching TOGGLE_LINK_COMMAND with null to remove link');
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, null);
              } else {
                // Ensure URL has protocol
                const urlWithProtocol = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') || url.startsWith('tel:')
                  ? url 
                  : `https://${url}`;
                
                console.log('URL with protocol:', urlWithProtocol);
                console.log('Dispatching TOGGLE_LINK_COMMAND with payload:', {
                  url: urlWithProtocol,
                  title: '',
                  target: '_blank'
                });
                
                editor.dispatchCommand(TOGGLE_LINK_COMMAND, {
                  url: urlWithProtocol,
                  title: '',
                  target: '_blank'
                });
              }
            }
          }
        }}
        className={`${styles['toolbarItem']} ${styles['spaced']}`}
        type="button"
        aria-label="Insert Link"
      >
        <i className={`${styles['format']} ${styles['format-link']}`} />
      </button>
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