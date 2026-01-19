import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { signIn } from "next-auth/react";
import { FiEye, FiEyeOff } from "react-icons/fi";

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
  const [isSigningIn, setIsSigningIn] = useState(false);

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
    // Skip confirmation check when password is visible
    if (!showPassword && password !== confirm) {
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

      // Immediately log the user in with the new password.
      setIsSigningIn(true);
      const loginResult = await signIn("credentials", {
        email: userEmail,
        password,
        redirect: false,
      });
      setIsSigningIn(false);

      if (!loginResult?.ok) {
        setError("Je wachtwoord is ingesteld, maar inloggen is mislukt. Probeer handmatig in te loggen.");
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
      ) : success ? (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded" role="alert">
          <div>Je wachtwoord is ingesteld. Je bent nu ingelogd.</div>
          <div className="mt-4">
            <a
              href="/"
              className="inline-block bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
            >
              Verder naar VeiligStallen
            </a>
          </div>
        </div>
      ) : (
        <>
          {error && (
            <div
              className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4"
              role="alert"
            >
              {error}
            </div>
          )}

          <p className="mb-6">
            Hallo {userName || "gebruiker"} ({userEmail}),
            <br />
            stel hieronder je nieuwe wachtwoord in.
          </p>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="block font-semibold mb-1">Nieuw wachtwoord</label>
              <div className="relative">
              <input
                  type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                  className="px-5 py-2 border rounded-full my-2 w-full pr-10"
              />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700 focus:outline-none"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <FiEyeOff className="h-5 w-5" />
                  ) : (
                    <FiEye className="h-5 w-5" />
                  )}
                </button>
              </div>
            </div>

            {!showPassword && (
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
            )}

            <button
              type="submit"
              className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              disabled={isSigningIn}
            >
              {isSigningIn ? "Bezig met inloggen…" : "Wachtwoord instellen"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}


