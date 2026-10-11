"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "done" | "error";

export default function PetWaitlistForm() {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot, must stay empty
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "loading") return;
    setStatus("loading");
    setMessage("");
    try {
      const res = await fetch("/api/pet-waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      if (res.ok) {
        setStatus("done");
        return;
      }
      setStatus("error");
      setMessage(
        res.status === 400
          ? "That email address doesn't look right."
          : "Something went wrong on our side. Please try again later."
      );
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <div className="pet-card">
      <h2>Want to know when it&apos;s ready?</h2>
      {status === "done" ? (
        <p className="pet-ok">
          You&apos;re on the list. We&apos;ll send you one email when RecallCheck is ready, nothing else.
        </p>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <p>
            Leave your email and we&apos;ll send you <strong>one message</strong> when a real recall checker is
            available. No other emails.
          </p>
          <input
            className="pet-input"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {/* honeypot: hidden from people, tempting for bots */}
          <input
            className="pet-hp"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <button className="pet-btn pet-btn-submit" type="submit" disabled={status === "loading"}>
            {status === "loading" ? "Saving…" : "Notify me"}
          </button>
          {status === "error" && <p className="pet-err" role="alert">{message}</p>}
        </form>
      )}
    </div>
  );
}
