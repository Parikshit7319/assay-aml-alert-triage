"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  ANTHROPIC_MODELS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENAI_BASE_URL,
  testBrowserModel,
  type BrowserModelConfig,
} from "@/lib/engine/providers/browser";
import { clearModelConfig, loadModelConfig, saveModelConfig } from "@/lib/model-key";
import "./ask.css";

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (cfg: BrowserModelConfig | null) => void;
}

type Provider = BrowserModelConfig["provider"];
type Status = { kind: "ok" | "error"; text: string } | null;

function validBaseUrl(s: string): boolean {
  if (!s.trim()) return true;
  try {
    const u = new URL(s.trim());
    return u.protocol === "https:" || (u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname));
  } catch {
    return false;
  }
}

export function ModelKeyDialog({ open, onClose, onSaved }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const ids = useId();
  const [wasOpen, setWasOpen] = useState(false);
  const [provider, setProvider] = useState<Provider>("anthropic");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_ANTHROPIC_MODEL);
  const [baseUrl, setBaseUrl] = useState("");
  const [hasSaved, setHasSaved] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);
  const testAbort = useRef<AbortController | null>(null);

  // Load the saved settings each time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      const saved = loadModelConfig();
      setHasSaved(!!saved);
      setProvider(saved?.provider ?? "anthropic");
      setApiKey(saved?.apiKey ?? "");
      setModel(saved ? saved.model : DEFAULT_ANTHROPIC_MODEL);
      setBaseUrl(saved?.baseUrl ?? "");
      setStatus(null);
      setTesting(false);
    }
  }

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      try {
        d.showModal();
      } catch {
        d.setAttribute("open", "");
      }
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => () => testAbort.current?.abort(), []);

  const changeProvider = (p: Provider) => {
    if (p === provider) return;
    setProvider(p);
    // A key belongs to one provider. Clearing it avoids sending it to the wrong one.
    setApiKey("");
    setModel(p === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : "");
    setStatus(null);
  };

  function build(): BrowserModelConfig | null {
    const key = apiKey.trim();
    const m = model.trim();
    if (!key) {
      setStatus({ kind: "error", text: "Paste an API key first." });
      return null;
    }
    if (!m && provider === "openai") {
      setStatus({ kind: "error", text: "Type the model id from your provider." });
      return null;
    }
    if (provider === "openai" && !validBaseUrl(baseUrl)) {
      setStatus({ kind: "error", text: "The base URL must be a full https:// address." });
      return null;
    }
    const cfg: BrowserModelConfig = { provider, apiKey: key, model: m || DEFAULT_ANTHROPIC_MODEL };
    if (provider === "openai" && baseUrl.trim()) cfg.baseUrl = baseUrl.trim().replace(/\/+$/, "");
    return cfg;
  }

  const close = () => {
    testAbort.current?.abort();
    onClose();
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    const cfg = build();
    if (!cfg) return;
    const stored = saveModelConfig(cfg);
    onSaved(cfg);
    if (stored) {
      close();
    } else {
      setStatus({ kind: "error", text: "This browser blocked local storage, so the key works only until you reload the page." });
    }
  };

  const remove = () => {
    testAbort.current?.abort();
    clearModelConfig();
    onSaved(null);
    setHasSaved(false);
    setApiKey("");
    setStatus({ kind: "ok", text: "Key removed from this browser." });
  };

  async function test() {
    const cfg = build();
    if (!cfg) return;
    testAbort.current?.abort();
    const ac = new AbortController();
    testAbort.current = ac;
    setTesting(true);
    setStatus(null);
    try {
      const r = await testBrowserModel(cfg, ac.signal);
      if (!ac.signal.aborted) setStatus({ kind: "ok", text: `The key works. ${r.model} answered in ${(r.ms / 1000).toFixed(1)} seconds.` });
    } catch (err) {
      if (!ac.signal.aborted) setStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      if (testAbort.current === ac) {
        testAbort.current = null;
        setTesting(false);
      }
    }
  }

  return (
    <dialog ref={ref} className="ask-dialog" aria-labelledby={`${ids}-title`} aria-describedby={`${ids}-privacy`} onClose={() => open && close()}>
      <form className="ask-dialog__form" onSubmit={save} noValidate>
        <h2 id={`${ids}-title`}>Use your own model key</h2>
        <p className="ask-dialog__lede">Connect a live model to this demo. Requests go straight from this browser to the provider and are billed to your account.</p>

        <label className="field">
          <span>Provider</span>
          <select value={provider} onChange={(e) => changeProvider(e.target.value as Provider)}>
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI-compatible</option>
          </select>
        </label>

        <label className="field">
          <span>API key</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={provider === "anthropic" ? "sk-ant-..." : "Your provider's API key"}
            autoComplete="off"
            spellCheck={false}
            required
          />
        </label>

        <label className="field">
          <span>Model id</span>
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            list={provider === "anthropic" ? `${ids}-models` : undefined}
            placeholder={provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : "Model id from your provider"}
            autoComplete="off"
            spellCheck={false}
            required={provider === "openai"}
          />
          <small>
            {provider === "anthropic"
              ? `Default ${DEFAULT_ANTHROPIC_MODEL}. You can also use ${ANTHROPIC_MODELS.filter((m) => m !== DEFAULT_ANTHROPIC_MODEL).join(" or ")}.`
              : "Use the exact model id your provider lists."}
          </small>
          {provider === "anthropic" && (
            <datalist id={`${ids}-models`}>
              {ANTHROPIC_MODELS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </label>

        {provider === "openai" && (
          <label className="field">
            <span>Base URL (optional)</span>
            <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={DEFAULT_OPENAI_BASE_URL} autoComplete="off" spellCheck={false} />
            <small>Leave blank for OpenAI. Any Chat Completions endpoint that accepts browser requests works.</small>
          </label>
        )}

        <p className="ask-privacy" id={`${ids}-privacy`}>
          Your key stays in this browser&apos;s local storage and is sent only to the provider you choose. Assay never receives it. Remove it here at any time.
        </p>

        <div aria-live="polite">{status && <p className={status.kind === "ok" ? "form-ok" : "form-error"}>{status.text}</p>}</div>

        <div className="ask-dialog__actions">
          <button type="submit" className="btn btn-small">
            Save
          </button>
          <button type="button" className="btn btn-outline btn-small" onClick={() => void test()} disabled={testing}>
            {testing ? "Testing" : "Test key"}
          </button>
          <span className="ask-spacer" />
          {hasSaved && (
            <button type="button" className="btn btn-quiet btn-small ask-remove" onClick={remove}>
              Remove key
            </button>
          )}
          <button type="button" className="btn btn-quiet btn-small" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default ModelKeyDialog;
