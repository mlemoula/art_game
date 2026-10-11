import PetWaitlistForm from "./PetWaitlistForm";

const FDA_RECALLS_URL ="https://www.fda.gov/animal-veterinary/safety-health/recalls-withdrawals";

// RecallCheck is NOT a working checker: it has no recall data behind it.
// This page must never display a "clear" / "no recall" verdict. If a real checker is built later,
// it needs a real data source (e.g. openFDA) and its own review before any verdict is shown.
export default function PetRecallCheckerComingSoon() {
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
        }
        .pet-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 40px; }
        .pet-brand-mark {
          width: 36px; height: 36px; border-radius: 10px;
          background: var(--pet-ink); color: var(--pet-yellow);
          display: flex; align-items: center; justify-content: center;
          font-weight: 800; font-size: 18px; letter-spacing: -1px; flex-shrink: 0;
        }
        .pet-brand-name { font-size: 17px; font-weight: 700; letter-spacing: -0.3px; }
        .pet-brand-tag { font-size: 12px; color: #737373; font-weight: 500; margin-left: auto; text-align: right; }

        .pet-badge {
          display: inline-block; width: fit-content;
          padding: 8px 14px; border-radius: 100px; margin-bottom: 20px;
          background: #FFF4C2; color: #7A5B00; border: 2px solid var(--pet-yellow);
          font-size: 12px; font-weight: 800; letter-spacing: 0.6px; text-transform: uppercase;
        }
        .pet-hero h1 {
          font-size: clamp(30px, 9vw, 40px); font-weight: 800; line-height: 1.04;
          letter-spacing: -1px; margin: 0 0 16px;
        }
        .pet-hero p { font-size: 16px; color: #404040; line-height: 1.5; margin: 0 0 14px; }
        .pet-hero p strong { color: var(--pet-ink); }

        .pet-card {
          background: #FAFAFA; border: 2px solid #E5E5E5; border-radius: 20px;
          padding: 24px 20px; margin-top: 12px;
        }
        .pet-card h2 { font-size: 18px; font-weight: 800; letter-spacing: -0.3px; margin: 0 0 8px; }
        .pet-card p { font-size: 14px; color: #525252; line-height: 1.5; margin: 0; }
        .pet-card ol { list-style: decimal; margin: 14px 0 0; padding-left: 20px; font-size: 14px; color: #525252; line-height: 1.55; }
        .pet-card li { margin-bottom: 6px; }

        .pet-btn {
          margin-top: 20px; width: 100%; height: 54px; text-decoration: none;
          background: var(--pet-yellow); color: var(--pet-ink);
          border-radius: 14px; font-size: 17px; font-weight: 700; letter-spacing: -0.2px;
          display: flex; align-items: center; justify-content: center;
          transition: transform 0.1s, background 0.15s;
        }
        .pet-btn:active { transform: scale(0.98); background: var(--pet-yellow-active); }
        .pet-btn-submit { border: none; cursor: pointer; font-family: inherit; }
        .pet-btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

        .pet-input {
          display: block; width: 100%; height: 52px; margin-top: 16px; padding: 0 14px;
          background: #FFFFFF; border: 2px solid #E5E5E5; border-radius: 14px; outline: none;
          font-family: inherit; font-size: 16px; font-weight: 500; color: var(--pet-ink);
          transition: border-color 0.15s;
        }
        .pet-input:focus { border-color: var(--pet-ink); }
        .pet-input::placeholder { color: #A3A3A3; font-weight: 400; }
        .pet-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
        .pet-ok { color: #166534; font-weight: 600; }
        .pet-err { color: #991B1B; margin-top: 12px; font-weight: 600; }

        .pet-footnote { margin-top: auto; padding-top: 32px; font-size: 12px; color: #737373; line-height: 1.5; }
      `}</style>

      <div className="pet-shell">
        <div className="pet-brand">
          <div className="pet-brand-mark">R</div>
          <div className="pet-brand-name">RecallCheck</div>
          <div className="pet-brand-tag">Early prototype</div>
        </div>

        <div className="pet-hero">
          <div className="pet-badge">Not live yet</div>
          <h1>Pet food recall checker: coming soon.</h1>
          <p>
            <strong>This page cannot check your bag.</strong> It has no recall data behind it yet, so please
            don&apos;t rely on it to know whether your dog or cat food is safe.
          </p>
        </div>

        <div className="pet-card">
          <h2>Check the official source now</h2>
          <p>The U.S. FDA publishes pet food recalls and withdrawals. To check your own bag:</p>
          <ol>
            <li>Open the FDA list below and look for your brand.</li>
            <li>Compare the lot code and best-before date printed on your bag with the recall notice.</li>
            <li>If you&apos;re unsure, stop feeding that bag and contact the manufacturer.</li>
          </ol>
          <a className="pet-btn" href={FDA_RECALLS_URL} target="_blank" rel="noopener noreferrer">
            Open the FDA recalls list
          </a>
        </div>

        <PetWaitlistForm />

        <div className="pet-footnote">
          The FDA list covers the United States only. RecallCheck is an unfinished prototype and is not affiliated
          with the FDA. No veterinary or safety advice is given on this page.
        </div>
      </div>
    </div>
  );
}
