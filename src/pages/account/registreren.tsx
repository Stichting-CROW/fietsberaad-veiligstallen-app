import type { GetServerSideProps } from "next";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/router";
import { CitizenShell, Field, buttonClass, inputClass, useCitizenOwner } from "~/components/citizen/CitizenShell";
import { safeCitizenLoginNext } from "~/utils/citizen-login-next";
import { readCitizenSessionFromContext } from "~/utils/server/buurt-wizard-gate";

export const getServerSideProps: GetServerSideProps = async (context) => {
  if (readCitizenSessionFromContext(context)) {
    return { redirect: { destination: safeCitizenLoginNext(context.query.next), permanent: false } };
  }
  return { props: {} };
};

export default function RegisterPage() {
  const router = useRouter();
  const owner = useCitizenOwner();
  const [email, setEmail] = useState("");
  const [email2, setEmail2] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [nieuwsbrief, setNieuwsbrief] = useState(true);
  const [voorwaarden, setVoorwaarden] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (email !== email2) {
      setError("Uw e-mailadressen komen niet met elkaar overeen");
      return;
    }
    if (password !== password2) {
      setError("Uw wachtwoorden komen niet met elkaar overeen");
      return;
    }
    if (!voorwaarden) {
      setError("U dient akkoord te gaan met de Algemene Voorwaarden");
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/account/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, nieuwsbrief, register: true, siteId: owner ?? null }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Registreren mislukt");
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
    <CitizenShell
      title="Registreren"
      page="Registreren"
      pageFooter={<p>Zie ook de <a className="underline" href="/fietsberaad/privacy" title="Privacy VeiligStallen" target="_blank" rel="noreferrer">privacy-verklaring</a></p>}
    >
      <form className="space-y-3 rounded bg-white p-4" onSubmit={(event) => void submit(event)}>
        {error && <p className="text-red-700">{error}</p>}
        <Field label="E-mail"><input className={inputClass} type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></Field>
        <Field label="E-mail nogmaals"><input className={inputClass} type="email" value={email2} onChange={(event) => setEmail2(event.target.value)} required /></Field>
        <Field label="Wachtwoord"><input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></Field>
        <Field label="Wachtwoord nogmaals"><input className={inputClass} type="password" value={password2} onChange={(event) => setPassword2(event.target.value)} required /></Field>
        <label className="block text-sm"><input type="checkbox" checked={nieuwsbrief} onChange={(event) => setNieuwsbrief(event.target.checked)} /> Nieuwsbrief</label>
        <label className="block text-sm"><input type="checkbox" checked={voorwaarden} onChange={(event) => setVoorwaarden(event.target.checked)} /> Ik ga akkoord met de <a className="underline" href="/fietsberaad/Algemene_voorwaarden" target="_blank" rel="noreferrer" title="Algemene Voorwaarden Veiligstallen">Algemene Voorwaarden</a></label>
        <button className={buttonClass} type="submit" disabled={submitting}>{submitting ? "Bezig…" : "Account aanmaken"}</button>
      </form>
    </CitizenShell>
  );
}
