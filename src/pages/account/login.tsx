import type { GetServerSideProps } from "next";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { CitizenShell, Field, buttonClass, inputClass } from "~/components/citizen/CitizenShell";
import { safeCitizenLoginNext } from "~/utils/citizen-login-next";
import { readCitizenSessionFromContext } from "~/utils/server/buurt-wizard-gate";

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (readCitizenSessionFromContext(context)) {
    return { redirect: { destination: safeCitizenLoginNext(context.query.next), permanent: false } };
  }
  return { props: {} };
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/account/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Inloggen mislukt");
        return;
      }
      await router.push(safeCitizenLoginNext(router.query.next));
    } catch {
      setError("De server is niet bereikbaar. Probeer het opnieuw.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <CitizenShell title="Inloggen" page="Login">
      <form className="space-y-3 rounded bg-white p-4" onSubmit={(event) => void submit(event)}>
        {error && <p className="text-red-700">{error}</p>}
        <Field label="E-mail">
          <input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
        <Field label="Wachtwoord">
          <input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <button className={buttonClass} type="submit" disabled={submitting}>{submitting ? "Bezig…" : "Inloggen"}</button>
        <p>
          <Link
            className={buttonClass}
            href={typeof router.query.next === "string"
              ? `/account/registreren?next=${encodeURIComponent(router.query.next)}`
              : "/account/registreren"}
          >
            Account aanmaken
          </Link>
        </p>
        <p><Link className={buttonClass} href="/account/wachtwoord">Wachtwoord vergeten</Link></p>
      </form>
    </CitizenShell>
  );
}
