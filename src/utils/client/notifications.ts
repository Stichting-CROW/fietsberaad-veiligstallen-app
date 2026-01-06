import toast, { type ToastOptions } from "react-hot-toast";

const defaultTopToastOptions: ToastOptions = {
  position: "top-center",
  duration: 4000,
  style: { zIndex: 99999 },
};

export function notifySuccess(message: string, options?: ToastOptions) {
  toast.success(message, { ...defaultTopToastOptions, ...(options ?? {}) });
}

export function notifyError(message: string, options?: ToastOptions) {
  toast.error(message, { ...defaultTopToastOptions, ...(options ?? {}) });
}


