import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";

type ValidateResponse =
  | { ok: true; user: { name: string; email: string } }
  | { ok: false; error: string };

type ConfirmResponse = { ok: true } | { ok: false; error: string };

export default function WachtwoordInstellenPage() {
  const router = useRouter();
  const token = useMemo(() => {
    const t = router.query.token;
    return typeof t === "string" ? t : "";
  }, [router.query.token]);

  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  useEffect(() => {
    if (!router.isReady) return;
    if (!token) {
      setError("Ongeldige link.");
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const res = await fetch("/api/password-setup/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        const json = (await res.json()) as ValidateResponse;
        if (!res.ok || !json.ok) {
          setError((json as any).error ?? "Ongeldige of verlopen link.");
          setLoading(false);
          return;
        }
        setUserName(json.user.name);
        setUserEmail(json.user.email);
        setLoading(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Er ging iets mis.");
        setLoading(false);
      }
    })();
  }, [router.isReady, token]);

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError("Wachtwoord moet minimaal 8 tekens zijn.");
      return;
    }
    if (password !== confirm) {
      setError("Wachtwoorden komen niet overeen.");
      return;
    }

    try {
      const res = await fetch("/api/password-setup/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const json = (await res.json()) as ConfirmResponse;
      if (!res.ok || !json.ok) {
        setError((json as any).error ?? "Wachtwoord instellen mislukt.");
        return;
      }
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wachtwoord instellen mislukt.");
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">Wachtwoord instellen</h1>

      {loading ? (
        <p>Bezig met laden…</p>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" role="alert">
          {error}
        </div>
      ) : success ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded" role="alert">
          Je wachtwoord is ingesteld. Je kunt nu inloggen.
        </div>
      ) : (
        <>
          <p className="mb-6">
            Hallo {userName || "gebruiker"} ({userEmail}),
            <br />
            stel hieronder je nieuwe wachtwoord in.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block font-semibold mb-1">Nieuw wachtwoord</label>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="px-5 py-2 border rounded-full my-2 w-full"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Herhaal wachtwoord</label>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="px-5 py-2 border rounded-full my-2 w-full"
              />
            </div>

            {error && (
              <div className="text-red-600 font-bold">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Wachtwoord instellen
            </button>
          </form>
        </>
      )}
    </div>
  );
}


