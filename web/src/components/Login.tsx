import {t as uiText, useLanguage} from "../lib/i18n/runtime";
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import Icon from './Icon';

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const languageRevision = useLanguage().revision;

  const setMustChangePassword = useStore((s) => s.setMustChangePassword);
  const [needSetup, setNeedSetup] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.authStatus().then((s) => setNeedSetup(!s.passwordSet)).catch(() => {});
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    if (needSetup && password !== confirm) {
      setErr(uiText("webobsidian.passwords-do-not-match-d69c3b"));
      return;
    }
    setBusy(true);
    try {
      if (needSetup) {
        await api.setup(password);
        setMustChangePassword(false); // a freshly-set password is already custom
      } else {
        const r = await api.login(password);
        setMustChangePassword(Boolean(r.mustChangePassword));
      }
      onAuthed();
    } catch (e: any) {
      setErr(e.message ?? 'Failed');
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
        <h1>{uiText("webobsidian.webobsidian-6d54ee")}</h1>
        <p>{needSetup ? uiText("webobsidian.set-a-master-password-to-secure-your-vault-9bf510") : uiText("webobsidian.enter-your-password-to-unlock-fceff5")}</p>
        <div className="err">{err}</div>
        <input
          className="text-input"
          type="password"
          placeholder={uiText("webobsidian.password-8be3c9")}
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {needSetup && (
          <input
            className="text-input"
            type="password"
            placeholder={uiText("webobsidian.confirm-password-4a7c56")}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        )}
        <button className="btn" type="submit" disabled={busy}>
          {needSetup ? uiText("webobsidian.create-unlock-a097cb") : uiText("webobsidian.unlock-1526a1")}
        </button>
      </form>
    </div>
  );
}
