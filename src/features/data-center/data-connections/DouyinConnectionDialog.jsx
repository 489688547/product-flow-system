import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { revealDataConnectionPassword, saveDataConnection } from "../../../state/dataConnectionsApi.js";
import { Button } from "../../../ui/Button.jsx";
import { Modal } from "../../../ui/Modal.jsx";

const EMPTY_DRAFT = { loginEmail: "", password: "" };

export function DouyinConnectionDialog({ open, connection, onClose, onSaved }) {
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [revealedPassword, setRevealedPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const emailRef = useRef(null);

  const clearPlaintext = useCallback(() => {
    setPasswordVisible(false);
    setRevealedPassword("");
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    setDraft({ loginEmail: connection?.loginEmail || "", password: "" });
    setError("");
    clearPlaintext();
    requestAnimationFrame(() => emailRef.current?.focus());
    return undefined;
  }, [clearPlaintext, connection, open]);

  useEffect(() => {
    if (!passwordVisible || !revealedPassword) return undefined;
    const timeout = window.setTimeout(clearPlaintext, 60_000);
    window.addEventListener("blur", clearPlaintext);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("blur", clearPlaintext);
    };
  }, [clearPlaintext, passwordVisible, revealedPassword]);

  const handleClose = useCallback(() => {
    clearPlaintext();
    setDraft(EMPTY_DRAFT);
    onClose();
  }, [clearPlaintext, onClose]);

  async function togglePassword() {
    if (passwordVisible) {
      clearPlaintext();
      return;
    }
    if (draft.password) {
      setPasswordVisible(true);
      return;
    }
    if (!connection?.id || busy) return;
    setBusy(true);
    setError("");
    try {
      const payload = await revealDataConnectionPassword(connection.id);
      setRevealedPassword(payload.password || "");
      setPasswordVisible(true);
    } catch (nextError) {
      setError(nextError?.code === "DATA_CONNECTION_FRESH_SESSION_REQUIRED" ? "为保护账号，请重新登录钉钉后再查看密码。" : nextError?.message || "密码暂时无法查看。");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!draft.loginEmail.trim() || (!connection && !draft.password) || busy) return;
    setBusy(true);
    setError("");
    try {
      const saved = await saveDataConnection({
        id: connection?.id || "",
        loginEmail: draft.loginEmail,
        password: draft.password,
        expectedVersion: connection?.version || 0
      });
      clearPlaintext();
      onSaved(saved);
      handleClose();
    } catch (nextError) {
      setError(nextError?.code === "DATA_CONNECTION_VERSION_CONFLICT" ? "连接刚被其他人更新，请刷新后再保存。" : nextError?.message || "保存失败，请重试。");
    } finally {
      setBusy(false);
    }
  }

  const displayedPassword = draft.password || revealedPassword;
  const canSave = Boolean(draft.loginEmail.trim() && (connection || draft.password));

  return (
    <Modal
      title={connection ? "管理抖音电商" : "添加抖音电商"}
      open={open}
      onClose={handleClose}
      size="small"
      footer={<><Button type="button" onClick={handleClose} disabled={busy}>取消</Button><Button type="submit" form="douyin-connection-form" variant="primary" disabled={!canSave || busy}>{busy ? <LoaderCircle size={16} aria-hidden="true" /> : null}{connection ? "保存并重新验证" : "保存并打开登录"}</Button></>}
    >
      <form id="douyin-connection-form" className="douyin-connection-form" onSubmit={submit}>
        <label>
          <span>登录邮箱</span>
          <input ref={emailRef} type="email" autoComplete="username" required value={draft.loginEmail} onChange={event => setDraft(current => ({ ...current, loginEmail: event.target.value }))} />
        </label>
        <label>
          <span>密码</span>
          <span className="douyin-password-control">
            <input
              type={passwordVisible ? "text" : "password"}
              autoComplete="current-password"
              required={!connection}
              value={displayedPassword}
              placeholder={connection ? "已保存" : "请输入密码"}
              onChange={event => {
                setDraft(current => ({ ...current, password: event.target.value }));
                setRevealedPassword("");
              }}
            />
            <button type="button" className="douyin-password-toggle" aria-label={passwordVisible ? "隐藏密码" : "显示密码"} disabled={busy || (!connection && !draft.password)} onClick={togglePassword}>
              {passwordVisible ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
            </button>
          </span>
        </label>
        {error ? <p className="data-connection-form-error" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}
