import { create } from 'zustand';

/**
 * In-app replacement for window.confirm(). Native dialogs are blocked or silently
 * auto-cancelled in embedded/preview browsers (the click then appears to do nothing),
 * so destructive actions use this promise-based dialog instead. Rendered by ConfirmDialog.
 */
export interface ConfirmRequest {
  message: string;
  /** Optional secondary line (e.g. a warning about what else is affected). */
  detail?: string;
  confirmLabel: string;
  danger: boolean;
  alternativeLabel?:string;
  alternative?:()=>void;
  items?:string[];
  selected?:string[];
  resolve: (ok: boolean) => void;
}

export const useConfirm = create<{ req: ConfirmRequest | null }>(() => ({ req: null }));

export function confirmDialog(
  message: string,
  opts: { confirmLabel?: string; danger?: boolean; detail?: string; alternativeLabel?:string;onAlternative?:()=>void;items?:string[];onSelection?:(paths:string[])=>void } = {},
): Promise<boolean> {
  // A second request while one is open cancels the first.
  useConfirm.getState().req?.resolve(false);
  return new Promise<boolean>((resolve) => {
    useConfirm.setState({
      req: {
        message,
        detail: opts.detail,
        confirmLabel: opts.confirmLabel ?? 'OK',
        danger: opts.danger ?? false,
        alternativeLabel:opts.alternativeLabel,
        alternative:opts.onAlternative?()=>{opts.onAlternative!();useConfirm.getState().req?.resolve(false);}:undefined,
        items:opts.items,selected:opts.items?[...opts.items]:undefined,
        resolve: (ok) => {
          if(ok&&opts.onSelection)opts.onSelection(useConfirm.getState().req?.selected??[]);
          useConfirm.setState({ req: null });
          resolve(ok);
        },
      },
    });
  });
}
