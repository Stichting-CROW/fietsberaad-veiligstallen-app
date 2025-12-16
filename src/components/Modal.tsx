import React, { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  modalStyle?: object;
  modalBodyStyle?: object;
  modalWrapperClassName?: string;
  clickOutsideClosesDialog?: boolean;
}

const Modal: React.FC<ModalProps> = ({
  onClose,
  children,
  title,
  modalStyle,
  modalBodyStyle,
  modalWrapperClassName,
  clickOutsideClosesDialog = false,
}) => {
  const modalWrapperRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);  

  const backDropHandler = useCallback(
    (e: MouseEvent) => {
      if (!clickOutsideClosesDialog) return;
      if (
        modalWrapperRef.current &&
        !modalWrapperRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    },
    [onClose, clickOutsideClosesDialog]
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      window.addEventListener("click", backDropHandler);
    });

    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", backDropHandler);
    };
  }, [backDropHandler]);

  useEffect(() => {
    const initEscapeHandler = (event: KeyboardEvent) => {
      // Check if <escape> is pressed
      if ( event.keyCode == 27 ) {
        console.log('escape pressed');
        // Close modal
        onClose();
      }
    }
    window.addEventListener('keydown', initEscapeHandler);

    return () => {
      window.removeEventListener('keydown', initEscapeHandler);
    }
  }, []);

  const handleCloseClick = (
    e?: React.MouseEvent<HTMLDivElement|HTMLAnchorElement, MouseEvent>
  ) => {
    if(e) e.preventDefault();
    onClose();
  };

  const modalContent = (
    <div className="modal-overlay relative z-20">
      <div className="modal-background absolute top-0 right-0 bottom-0 left-0" onClick={handleCloseClick} />
      <div ref={modalWrapperRef} className={`modal-wrapper ${modalWrapperClassName || ''}`}>
        <div className={`
          modal
          pl-5 pr-5 pb-5 pt-5 sm:pl-10 sm:pr-10 sm:pt-10 sm:pb-10
        `}
        style={modalStyle}
        >
          <a href="#" onClick={handleCloseClick} className="
            modal-close-button
            inline-block
            p-4
            -m-4
          ">
            <img src="/images/icon-close-gray.png" alt="Sluiten" className="w-4" />
          </a>
          <div
            className="modal-body relative"
            style={modalBodyStyle}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  if(!mounted) {
    return null;
  }

  return ReactDOM.createPortal(
    modalContent,
    document.getElementById("modal-root") as HTMLElement
  );
};

export default Modal;
