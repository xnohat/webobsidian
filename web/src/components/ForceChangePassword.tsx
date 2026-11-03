import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Icon from './Icon';

const MIN_LEN = 6;
const DEFAULT_PASSWORD = '123456';

/**
 * Blocking screen shown right after login when the account is still on the
 * default password (server reports `mustChangePassword`). The vault can't be
 * used until a custom password is set — there is no dismiss.
 */
export default function ForceChangePassword() {
  const languageRevision = useLanguage().revision;

  const setMustChangePassword = useStore((s) => s.setMustChangePassword);
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (next.length < MIN_LEN) {
      setErr(`Password must be at least ${MIN_LEN} characters`);
      return;
    }
    if (next === DEFAULT_PASSWORD) {
      setErr(uiText("webobsidian.choose-a-password-different-from-the-default-566640"));
      return;
    }
    if (next !== confirm) {
      setErr(uiText("webobsidian.passwords-do-not-match-d69c3b"));
      return;
    }
    setBusy(true);
    try {
      // Current password is the default; the server verifies it.
      await api.changePassword(DEFAULT_PASSWORD, next);
      setMustChangePassword(false);
    } catch (e: any) {
      setErr(e.message ?? uiText("webobsidian.failed-to-change-password-2398d6"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <div className="logo">
          <Icon name="gem" size={40} />
        </div>
        <h1>{uiText("webobsidian.set-a-new-password-1e83ae")}</h1>
        <p>
          {uiText("webobsidian.you-are-signed-in-with-the-default-password-4ec7dd")}<code>123456</code>{uiText("webobsidian.-choose-a-new-password-to-secure-your-vault-befo-8842b7")} </p>
        <div className="err">{err}</div>
        <input
          className="text-input"
          type="password"
          placeholder={uiText("plugins.publish.action-new-password")}
          autoFocus
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        <input
          className="text-input"
          type="password"
          placeholder={uiText("webobsidian.confirm-new-password-f85039")}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? uiText("webobsidian.saving-56a228") : uiText("webobsidian.set-password-continue-ab4009")}
        </button>
      </form>
    </div>
  );
}
