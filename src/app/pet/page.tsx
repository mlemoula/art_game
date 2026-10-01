"use client";

import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "loading" | "result";
type ResultState = "clear" | "match";

export default function PetRecallChecker() {
  const [brand, setBrand] = useState("");
  const [lot, setLot] = useState("");
  const [brandFocused, setBrandFocused] = useState(false);
  const [lotFocused, setLotFocused] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [resultState, setResultState] = useState<ResultState>("clear");
  const forceStateRef = useRef<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    forceStateRef.current = params.get("state");
    if (forceStateRef.current) {
      const t1 = setTimeout(() => {
        setBrand("Purina");
        setLot("4421A");
      }, 500);
      const t2 = setTimeout(() => {
        runCheck();
      }, 1500);
      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  function runCheck() {
    setPhase("loading");
    timeoutRef.current = setTimeout(() => {
      setResultState(forceStateRef.current === "match" ? "match" : "clear");
      setPhase("result");
    }, 1400);
  }

  const showingResult = phase === "result";
  const showingClear = showingResult && resultState === "clear";
  const showingMatch = showingResult && resultState === "match";

  return (
    <div className="pet-app">
      <style>{`
        .pet-app {
          --pet-ink: #0A0A0A;
          --pet-yellow: #FFD400;
          --pet-yellow-active: #E5BD00;
          font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
          background: #FFFFFF;
          color: var(--pet-ink);
          min-height: 100dvh;
          width: 100%;
          position: relative;
          overflow-x: hidden;
          -webkit-font-smoothing: antialiased;
          box-sizing: border-box;
        }
        .pet-app *, .pet-app *::before, .pet-app *::after { box-sizing: border-box; }

        .pet-shell {
          max-width: 480px;
          margin: 0 auto;
          min-height: 100dvh;
          display: flex;
          flex-direction: column;
          padding: calc(env(safe-area-inset-top, 0px) + 32px) 24px calc(env(safe-area-inset-bottom, 0px) + 32px);
          position: relative;
        }

        .pet-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 48px; }
        .pet-brand-mark {
          width: 36px; height: 36px; border-radius: 10px;
          background: var(--pet-ink); color: var(--pet-yellow);
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 18px; letter-spacing: -1px; flex-shrink: 0;
        }
        .pet-brand-name { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }
        .pet-brand-tag { font-size: 12px; color: #737373; font-weight: 500; margin-left: auto; text-align: right; }

        .pet-hero { margin-bottom: 32px; }
        .pet-hero h1 {
          font-size: clamp(30px, 9vw, 40px);
          font-weight: 800;
          line-height: 1.02;
          letter-spacing: -1px;
          margin: 0 0 14px;
        }
        .pet-hero p { font-size: 15px; color: #525252; line-height: 1.4; margin: 0; }

        .pet-card {
          background: #FAFAFA;
          border: 2px solid #E5E5E5;
          border-radius: 20px;
          padding: 24px 20px;
        }
        .pet-card:focus-within { border-color: var(--pet-ink); }

        .pet-field { margin-bottom: 20px; }
        .pet-field:last-of-type { margin-bottom: 0; }
        .pet-label { display: block; font-size: 13px; font-weight: 600; color: #525252; margin-bottom: 8px; }

        .pet-input-wrap {
          display: flex; align-items: center;
          background: #FFFFFF; border: 2px solid #E5E5E5; border-radius: 14px;
          padding: 0 14px; height: 52px; transition: border-color 0.15s;
        }
        .pet-input-wrap.focused { border-color: var(--pet-ink); }
        .pet-input-wrap input {
          border: none; outline: none; background: transparent;
          font-family: inherit; font-size: 16px; font-weight: 500; color: var(--pet-ink);
          width: 100%;
        }
        .pet-input-wrap input::placeholder { color: #A3A3A3; font-weight: 400; }

        .pet-check-btn {
          margin-top: 24px; width: 100%; height: 54px;
          background: var(--pet-yellow); color: var(--pet-ink);
          border: none; border-radius: 14px;
          font-family: inherit; font-size: 17px; font-weight: 700; letter-spacing: -0.2px;
          cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px;
          transition: transform 0.1s, background 0.15s;
        }
        .pet-check-btn:active { transform: scale(0.98); background: var(--pet-yellow-active); }
        .pet-check-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .pet-footnote {
          margin-top: auto; padding-top: 32px;
          display: flex; align-items: center; gap: 10px;
          font-size: 12px; color: #A3A3A3; font-weight: 500;
        }
        .pet-dot {
          width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
          background: #22C55E; box-shadow: 0 0 0 4px rgba(34,197,94,0.15);
        }

        .pet-loading {
          position: absolute; inset: 0;
          background: rgba(255,255,255,0.97);
          display: none; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
          z-index: 10;
        }
        .pet-loading.active { display: flex; }
        .pet-spinner {
          width: 44px; height: 44px; border: 5px solid #E5E5E5; border-top-color: var(--pet-ink);
          border-radius: 50%; animation: pet-spin 0.8s linear infinite;
        }
        @keyframes pet-spin { to { transform: rotate(360deg); } }
        .pet-loading-text { font-size: 15px; font-weight: 600; color: #525252; }

        .pet-result {
          position: absolute; inset: 0; background: #FFFFFF;
          display: none; flex-direction: column;
          padding: calc(env(safe-area-inset-top, 0px) + 32px) 24px calc(env(safe-area-inset-bottom, 0px) + 32px);
          z-index: 20; max-width: 480px; margin: 0 auto;
        }
        .pet-result.active { display: flex; }

        .pet-result-badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 16px; border-radius: 100px;
          font-size: 13px; font-weight: 700; margin-bottom: 28px; width: fit-content;
        }
        .pet-result-badge.clear { background: #DCFCE7; color: #166534; }
        .pet-result-badge.match { background: #FEE2E2; color: #991B1B; }
        .pet-badge-icon {
          width: 18px; height: 18px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 800; flex-shrink: 0;
        }
        .pet-result-badge.clear .pet-badge-icon { background: #22C55E; color: #FFF; }
        .pet-result-badge.match .pet-badge-icon { background: #EF4444; color: #FFF; }

        .pet-result h2 { font-size: clamp(30px, 9vw, 40px); font-weight: 800; letter-spacing: -1px; line-height: 1.02; margin: 0 0 18px; }
        .pet-result.clear h2 { color: var(--pet-ink); }
        .pet-result.match h2 { color: #991B1B; }

        .pet-result-body { font-size: 15px; line-height: 1.45; color: #525252; margin-bottom: 36px; }

        .pet-result-meta {
          margin-top: auto; padding: 20px 0 0; border-top: 2px solid #E5E5E5;
          display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
        }
        .pet-meta-label { font-size: 10px; color: #A3A3A3; font-weight: 600; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
        .pet-meta-value { font-size: 14px; font-weight: 600; color: var(--pet-ink); word-break: break-word; }
      `}</style>

      <div className="pet-shell">
        <div className="pet-brand">
          <div className="pet-brand-mark">R</div>
          <div className="pet-brand-name">RecallCheck</div>
          <div className="pet-brand-tag">Pet Food Recall Database</div>
        </div>

        <div className="pet-hero">
          <h1>Is your dog food recalled?</h1>
          <p>Enter the brand and lot number from the bag.</p>
        </div>

        <div className="pet-card">
          <div className="pet-field">
            <label className="pet-label" htmlFor="pet-brand">Brand name</label>
            <div className={`pet-input-wrap${brandFocused ? " focused" : ""}`}>
              <input
                id="pet-brand"
                type="text"
                placeholder="e.g. Purina, Blue Buffalo"
                autoComplete="off"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                onFocus={() => setBrandFocused(true)}
                onBlur={() => setBrandFocused(false)}
              />
            </div>
          </div>

          <div className="pet-field">
            <label className="pet-label" htmlFor="pet-lot">Lot number</label>
            <div className={`pet-input-wrap${lotFocused ? " focused" : ""}`}>
              <input
                id="pet-lot"
                type="text"
                placeholder="Printed on the bag near the date"
                autoComplete="off"
                value={lot}
                onChange={(e) => setLot(e.target.value)}
                onFocus={() => setLotFocused(true)}
                onBlur={() => setLotFocused(false)}
              />
            </div>
          </div>

          <button type="button" className="pet-check-btn" onClick={runCheck} disabled={phase === "loading"}>
            Check recall
          </button>
        </div>

        <div className="pet-footnote">
          <div className="pet-dot" />
          <div>Sourced from FDA recall database · Updated daily</div>
        </div>

        <div className={`pet-loading${phase === "loading" ? " active" : ""}`}>
          <div className="pet-spinner" />
          <div className="pet-loading-text">Checking recall database…</div>
        </div>
      </div>

      <div className={`pet-result clear${showingClear ? " active" : ""}`}>
        <div className="pet-result-badge clear">
          <div className="pet-badge-icon">✓</div>
          <div>No match found</div>
        </div>
        <h2>Your bag is clear.</h2>
        <div className="pet-result-body">
          No active recall matches this brand and lot number. You can keep using this bag as normal.
        </div>
        <div className="pet-result-meta">
          <div>
            <div className="pet-meta-label">Checked against</div>
            <div className="pet-meta-value">{brand || "—"}</div>
          </div>
          <div>
            <div className="pet-meta-label">Lot number</div>
            <div className="pet-meta-value">{lot || "—"}</div>
          </div>
        </div>
      </div>

      <div className={`pet-result match${showingMatch ? " active" : ""}`}>
        <div className="pet-result-badge match">
          <div className="pet-badge-icon">!</div>
          <div>Recall found</div>
        </div>
        <h2>Stop feeding this bag.</h2>
        <div className="pet-result-body">
          This lot number matches an active FDA recall. Stop feeding immediately and contact the manufacturer for a
          refund or replacement.
        </div>
        <div className="pet-result-meta">
          <div>
            <div className="pet-meta-label">Recall date</div>
            <div className="pet-meta-value">Oct 12, 2026</div>
          </div>
          <div>
            <div className="pet-meta-label">Reason</div>
            <div className="pet-meta-value">Salmonella risk</div>
          </div>
        </div>
      </div>
    </div>
  );
}
