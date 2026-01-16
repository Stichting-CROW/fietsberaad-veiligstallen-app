import React, { useRef, useState } from "react";
import Head from "next/head";
import { useRouter, useSearchParams } from "next/navigation";
import useQueryParam from "../hooks/useQueryParam";
import { FiEye, FiEyeOff } from "react-icons/fi";

// Import components
import PageTitle from "~/components/PageTitle";
import FormInput from "~/components/Form/FormInput";
import FormCheckbox from "~/components/Form/FormCheckbox";
import AppHeader from "~/components/AppHeader";
import { Button } from "~/components/Button";
import { signIn } from "next-auth/react";

// Import styles
import Styles from "./login.module.css";
import { type NextPage } from "next/types";

const Login: NextPage = () => {
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect");
  const error = useQueryParam("error")[0];

  const onSignIn = async (e: any) => {
    try {
      e.preventDefault();

      if (
        emailRef.current &&
        emailRef.current.value !== "" &&
        passwordRef.current &&
        passwordRef.current.value !== ""
      ) {
        console.log("*** Signing in");
        const result = await signIn("credentials", {
          email: emailRef.current.value.trim(),
          password: passwordRef.current.value,
          redirect: false,
        });

        if (result?.ok) {
          router.push(redirect || "/");
        } else {
          alert("Login failed");
        }
      } else {
        alert("no email or password given");
      }
    } catch (error) {
      console.error("Error in onSignIn:", error);
      alert("Login failed");
    }
  };

  const allowLogin =
    emailRef.current?.value !== "" && passwordRef.current?.value !== "";

  return (
    <>
      <Head>
        <title>Login - VeiligStallen</title>
      </Head>
      <div
        className="flex flex-col justify-between"
        style={{ height: "100dvh" }}
      >
        <AppHeader />

        <div className={`${Styles.LoginPage} flex-1`}>
          <div
            className={`
					${Styles.LoginBox}
					mx-auto
					flex
					flex-wrap
					rounded-xl
					bg-white
					px-4
					py-8

					shadow-md
					sm:px-12
				`}
            style={{
              width: "1000px",
              maxWidth: "90%",
            }}
          >
            <div
              data-name="bicycle-image"
              className="
							px-12
							py-2
							sm:px-12

							sm:py-10
							sm:pr-24
						"
            >
              <img
                src="/images/bike-blue-green.png"
                width="100%"
                style={{ maxWidth: "350px" }}
              />
            </div>
            <div
              data-name="login-form"
              className="
							flex

							flex-1
							flex-col
							justify-around
						"
            >
              <div data-name="Some spacing" className="h-2"></div>
              <form
                onSubmit={onSignIn}
                data-name="Title and login form"
                className="mb-8"
              >
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

                <div>
                  <FormInput
                    innerRef={emailRef}
                    type="email"
                    placeholder="E-mail"
                    required
                    className="w-full"
                  />
                </div>

                <div className="relative">
                  <FormInput
                    innerRef={passwordRef}
                    type={showPassword ? "text" : "password"}
                    placeholder="Wachtwoord"
                    required
                    className="w-full pr-10"
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

                <div className="flex justify-between">
                  <div className="flex flex-col justify-center">
                    {/* <FormCheckbox classes="text-gray-500 text-sm">
										Ingelogd blijven
									</FormCheckbox> */}
                  </div>
                  <div className="flex flex-col justify-center">
                    <Button
                      style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}
                      onClick={onSignIn}
                    >
                      Inloggen
                    </Button>
                  </div>
                </div>

                <div className="my-2 hidden text-center text-sm sm:text-right">
                  Nog geen account?{" "}
                  <a href="/register" className="underline">
                    Registreren
                  </a>
                </div>
              </form>

              <div className="text-center">
                <p className="text-sm my-4">
                  Ben je een pashouder, heb je een abonnement of wil je stallingstegoed opwaarderen? ➡️ <a href="https://www.veiligstallen.nl/fietsberaad/login" target="_blank" rel="external" className="underline">Klik hier om in te loggen</a>.
                </p>
              </div>

              <div data-name="Footer: Password forgotten & Contact helpdesk">
                <p className="text-center my-4">
                  <a href="/reset-password" className="mr-5 text-sm underline">
                    Wachtwoord vergeten?
                  </a>
                  <br />
                  <a
                    href="mailto:fietsberaad@crow.nl"
                    className="text-sm underline"
                  >
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

export default Login;
