import React, { useRef } from "react";
import Head from "next/head";
import { useRouter } from 'next/navigation'
import useQueryParam from '../../hooks/useQueryParam';
import { type NextPage } from "next/types";

// Import components
import PageTitle from "~/components/PageTitle";
import FormInput from "~/components/Form/FormInput";
import FormCheckbox from "~/components/Form/FormCheckbox";
import AppHeader from "~/components/AppHeader";
import { Button } from "~/components/Button";
import { signIn } from "next-auth/react";

// Import styles
import Styles from "../login.module.css";

const Login: NextPage = () => {
    const emailRef = useRef<HTMLInputElement | null>(null);
    const passwordRef = useRef<HTMLInputElement | null>(null);

    const router = useRouter()
    const error = useQueryParam("error")[0];

    const onSignIn = async (e: React.MouseEvent<HTMLButtonElement>) => {
        if (
            emailRef.current && emailRef.current.value !== '' &&
            passwordRef.current && passwordRef.current.value !== ''
        ) {
            signIn("credentials", {
                email: emailRef.current.value.trim(),
                password: passwordRef.current.value,
                callbackUrl: "/",
            });
        } else {
            alert('no email of password given');
        }
    };

    const allowLogin = emailRef.current?.value !== '' && passwordRef.current?.value !== '';

    return (
        <>
            <Head>
                <title>
                    Wachtwoord vergeten - VeiligStallen
                </title>
            </Head>
            <div className="flex flex-col justify-between" style={{ height: '100dvh' }}>

                <AppHeader />

                <div className={`${Styles.LoginPage} flex-1`}>
                    <div className={`
						${Styles.LoginBox}
						bg-white
						rounded-xl
						mx-auto
						px-4
						sm:px-12
						py-8
						shadow-md

						flex
						flex-wrap
					`}
                        style={{
                            width: '1000px',
                            maxWidth: '90%'
                        }}>
                        <div
                            data-name="bicycle-image"
                            className="
								px-12
								sm:px-12
								sm:pr-24

								py-2
								sm:py-10
							"
                        >
                            <img src="/images/bike-blue-green.png"
                                width="100%"
                                style={{ maxWidth: '350px' }}
                            />
                        </div>
                        <div
                            data-name="login-form"
                            className="
								flex-1

								flex
								flex-col
								justify-around
							"
                        >
                            <div data-name="Some spacing" className="h-2">

                            </div>
                            <div data-name="Title and login form" className="mb-8">
                                <PageTitle className="flex flex-col justify-center hidden sm:block">
                                    <div>
                                        <img src="/images/logo-without-text.png" alt="VeiligStallen logo"
                                            className="inline-block mr-6"
                                            style={{ height: '60px' }}
                                        />
                                        <b>Wachtwoord vergeten?</b>
                                    </div>
                                </PageTitle>

                                <div>
                                    <p className="my-2">
                                        Ben je je wachtwoord vergeten? Neem dan contact op met <a href="mailto:fietsberaad@crow.nl?subject=VeiligStallen wachtwoord vergeten" className="underline">fietsberaad@crow.nl</a> en vraag om een nieuw wachtwoord.
                                    </p>
                                    <p className="my-2 mt-6">
                                        Of:
                                    </p>
                                    <ol className="my-2">
                                        <li className="list-decimal ml-4">Ga naar <a href="https://fms.veiligstallen.nl/security/login.cfm" className="underline" target="_blank">fms.veiligstallen.nl</a></li>
                                        <li className="list-decimal ml-4">Klik op <b>Wachtwoord vergeten?</b></li>
                                        <li className="list-decimal ml-4">Vul je e-mailadres in</li>
                                        <li className="list-decimal ml-4">Klik op <b>Verzenden</b></li>
                                        <li className="list-decimal ml-4">Log daarna <a href="/login" className="underline">hier</a> in</li>
                                    </ol>
                                </div>
                            </div>

                            <div data-name="Footer: Password forgotten & Contact helpdesk">
                                <div className="text-center">
                                    <a href="/login" className="underline text-sm mr-5">
                                        Inloggen
                                    </a>
                                    <a href="mailto:fietsberaad@crow.nl" className="underline text-sm">
                                        Contact helpdesk
                                    </a>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            </div >
        </>
    );
};

export default Login;
