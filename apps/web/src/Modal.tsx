import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
export function Modal({title, close, children}: {title: string; close: () => void; children: ReactNode}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!; const previous = document.activeElement as HTMLElement | null
    dialog.showModal(); dialog.querySelector<HTMLElement>('input:not([type=file]), textarea, select')?.focus()
    return () => { dialog.close(); previous?.focus() }
  }, [])
  return <dialog ref={ref} onCancel={e => {e.preventDefault(); close()}} className="modal"><div className="modal-top"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={close}><X size={21}/></button></div>{children}</dialog>
}
