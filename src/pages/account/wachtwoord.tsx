import { useState, type FormEvent } from "react";
import { useRouter } from "next/router";
import { CitizenShell, Field, buttonClass, inputClass } from "~/components/citizen/CitizenShell";

export default function PasswordPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!router.isReady) {
    return <CitizenShell title="Wachtwoord" page="Login"><p>Laden…</p></CitizenShell>;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const response = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(token ? { token, password } : { email }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Mislukt");
        return;
      }
      setMessage(token ? "Uw wachtwoord is gewijzigd" : "Als het adres bekend is, is er een link verstuurd");
    } catch {
      setError("De server is niet bereikbaar. Probeer het opnieuw.");
    }
  }

  return (
    <CitizenShell title="Wachtwoord" page="Login">
      <form className="space-y-3 rounded bg-white p-4" onSubmit={(event) => void submit(event)}>
        {error && <p className="text-red-700">{error}</p>}
        {message && <p>{message}</p>}
        {token ? (
          <Field label="Nieuw wachtwoord"><input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
        ) : (
          <Field label="E-mail"><input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
        )}
        <button className={buttonClass} type="submit">{token ? "Wachtwoord opslaan" : "Link versturen"}</button>
      </form>
    </CitizenShell>
  );
}
