import React, { useEffect, useMemo, useState } from "react";
import Head from "next/head";
import { useRouter, useSearchParams } from "next/navigation";
import { type NextPage } from "next/types";
import { signIn } from "next-auth/react";
import AppHeader from "~/components/AppHeader";
import { Button } from "~/components/Button";
import FormInput from "~/components/Form/FormInput";
import PageTitle from "~/components/PageTitle";
import Styles from "./login.module.css";

const LoginWithCode: NextPage = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const emailFromQuery = searchParams.get("email")?.trim().toLowerCase() ?? "";
  const redirectParam = searchParams.get("redirect") ?? "/beheer";
  const redirect = redirectParam.startsWith("/") ? redirectParam : "/beheer";

  const [email, setEmail] = useState(emailFromQuery);
  const [code, setCode] = useState("");
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [hasRequestedCode, setHasRequestedCode] = useState(false);
  const [requestedEmail, setRequestedEmail] = useState("");

  useEffect(() => {
    setEmail(emailFromQuery);
  }, [emailFromQuery]);

  const canRequestCode = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);
  const canVerify = useMemo(() => /^\d{6}$/.test(code) && canRequestCode, [code, canRequestCode]);

  const requestCode = async () => {
    if (!canRequestCode || isSendingCode) return;

    setIsSendingCode(true);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/auth/login-with-code/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error ?? "Kon geen login-code versturen");
      }

      setHasRequestedCode(true);
      setRequestedEmail(email);
      setStatusMessage("Er is een login-code naar je mailbox verstuurd.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Kon geen login-code versturen";
      setStatusMessage(message);
    } finally {
      setIsSendingCode(false);
    }
  };

  useEffect(() => {
    if (requestedEmail && email !== requestedEmail) {
      setHasRequestedCode(false);
      setCode("");
    }
  }, [email, requestedEmail]);

  const onVerifyCode = async () => {
    if (!canVerify || isVerifying) return;

    setIsVerifying(true);
    setStatusMessage(null);

    try {
      const verifyResponse = await fetch("/api/auth/login-with-code/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const verifyData = (await verifyResponse.json()) as {
        userid?: string;
        token?: string;
        error?: string;
      };

      if (!verifyResponse.ok || !verifyData.userid || !verifyData.token) {
        throw new Error(verifyData.error ?? "Ongeldige of verlopen code");
      }

      const signInResult = await signIn("token-login", {
        userid: verifyData.userid,
        token: verifyData.token,
        redirect: false,
      });

      if (!signInResult?.ok) {
        throw new Error("Inloggen is mislukt");
      }

      router.push(redirect);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Inloggen is mislukt";
      setStatusMessage(message);
    } finally {
      setIsVerifying(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (hasRequestedCode) {
      await onVerifyCode();
      return;
    }
    await requestCode();
  };

  const onRequestCodeClick = (e: React.SyntheticEvent) => {
    e.preventDefault();
    void requestCode();
  };

  const onVerifyCodeClick = (e: React.SyntheticEvent) => {
    e.preventDefault();
    void onVerifyCode();
  };

  return (
    <>
      <Head>
        <title>Login met code - VeiligStallen</title>
      </Head>
      <div className="flex flex-col justify-between" style={{ height: "100dvh" }}>
        <AppHeader />
        <div className={`${Styles.LoginPage} flex-1`}>
          <div
            className={`${Styles.LoginBox} mx-auto flex flex-wrap rounded-xl bg-white px-4 py-8 shadow-md sm:px-12`}
            style={{ width: "1000px", maxWidth: "90%" }}
          >
            <div className="px-12 py-2 sm:px-12 sm:py-10 sm:pr-24">
              <img
                src="/images/bike-blue-green.png"
                alt="Illustratie van een fiets"
                width="100%"
                style={{ maxWidth: "350px" }}
              />
            </div>
            <div className="flex flex-1 flex-col justify-around">
              <div className="h-2"></div>
              <form onSubmit={onSubmit} className="mb-8">
                <PageTitle className="flex hidden flex-col justify-center sm:block">
                  <div>
                    <img
                      src="/images/logo-without-text.png"
                      alt="VeiligStallen logo"
                      className="mr-6 inline-block"
                      style={{ height: "60px" }}
                    />
                    <b>Log in met je account</b>
                  </div>
                </PageTitle>

                <FormInput
                  type="email"
                  placeholder="E-mail"
                  className="w-full"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEmail(e.target.value.toLowerCase())
                  }
                  disabled={Boolean(emailFromQuery)}
                  required
                />

                {hasRequestedCode ? (
                  <>
                    <p className="mt-2 text-sm text-gray-700">
                      Er is een login-code naar je mailbox verstuurd. Vul de code hieronder in om
                      verder te gaan.
                    </p>

                    <FormInput
                      type="text"
                      placeholder="6-cijferige code"
                      className="w-full"
                      value={code}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                      }
                      inputMode="numeric"
                      pattern="\d{6}"
                      maxLength={6}
                      autoComplete="one-time-code"
                      required={hasRequestedCode}
                    />
                  </>
                ) : null}

                {statusMessage ? (
                  <p className="mt-1 text-sm text-gray-700">{statusMessage}</p>
                ) : null}

                <div className="mt-3 flex items-center justify-between gap-3">
                  {hasRequestedCode ? (
                    <Button onClick={onRequestCodeClick} variant="secundary" className="underline">
                      {isSendingCode ? "Code versturen..." : "Verstuur code opnieuw"}
                    </Button>
                  ) : <div></div>}
                  {hasRequestedCode ? (
                    <Button onClick={onVerifyCodeClick}>
                      {isVerifying ? "Inloggen..." : "Inloggen"}
                    </Button>
                  ) : (
                    <Button onClick={onRequestCodeClick} disabled={!canRequestCode || isSendingCode}>
                      {isSendingCode ? "Code versturen..." : "Mail mij de login-code"}
                    </Button>
                  )}
                  <button type="submit" className="hidden" aria-hidden="true" />
                </div>
              </form>

              <div>
                <p className="text-center my-4">
                  <a href="mailto:fietsberaad@crow.nl" className="text-sm underline">
                    Contact helpdesk
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default LoginWithCode;
