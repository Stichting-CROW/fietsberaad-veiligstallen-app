import React, { useRef, useState } from "react";
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
import { makeClientApiCall } from "~/utils/client/api-tools";

// Import styles
import Styles from "../login.module.css";

const Login: NextPage = () => {
    const emailRef = useRef<HTMLInputElement | null>(null);
    const passwordRef = useRef<HTMLInputElement | null>(null);
    const resetEmailRef = useRef<HTMLInputElement | null>(null);

    const router = useRouter()
    const error = useQueryParam("error")[0];
    const [resetLoading, setResetLoading] = useState(false);
    const [resetMessage, setResetMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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

    const onRequestPasswordReset = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        
        if (!resetEmailRef.current || !resetEmailRef.current.value) {
            setResetMessage({ type: 'error', text: 'Vul een e-mailadres in' });
            return;
        }

        const email = resetEmailRef.current.value.trim();
        if (!email.includes('@')) {
            setResetMessage({ type: 'error', text: 'Vul een geldig e-mailadres in' });
            return;
        }

        setResetLoading(true);
        setResetMessage(null);

        const response = await makeClientApiCall<{ ok: boolean; error?: string }>(
            '/api/password-setup/request',
            'POST',
            { email }
        );

        setResetLoading(false);

        if (!response.success) {
            setResetMessage({ 
                type: 'error', 
                text: `Er is een fout opgetreden: ${response.error}` 
            });
            return;
        }

        if (!response.result?.ok) {
            setResetMessage({ 
                type: 'error', 
                text: response.result?.error || 'Er is een fout opgetreden' 
            });
            return;
        }

        setResetMessage({ 
            type: 'success', 
            text: 'Als dit e-mailadres bij ons bekend is, heb je een e-mail ontvangen met instructies om je wachtwoord opnieuw in te stellen.' 
        });
        if (resetEmailRef.current) {
            resetEmailRef.current.value = '';
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
                                        Ben je je wachtwoord vergeten? Vul het e-mailadres dat bij ons bekend is in en klik op "Wachtwoord opnieuw instellen" knop om een e-mail te ontvangen waarmee je een nieuw wachtwoord kunt instellen.
                                    </p>
                                    
                                    <form onSubmit={onRequestPasswordReset} className="mt-6">
                                        <div className="mb-4">
                                            <label htmlFor="reset-email" className="block text-sm font-medium text-gray-700 mb-2">
                                                E-mailadres
                                            </label>
                                            <input
                                                ref={resetEmailRef}
                                                id="reset-email"
                                                type="email"
                                                required
                                                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                                                placeholder="jouw@emailadres.nl"
                                                disabled={resetLoading}
                                            />
                                        </div>
                                        
                                        {resetMessage && (
                                            <div className={`mb-4 p-3 rounded-md ${
                                                resetMessage.type === 'success' 
                                                    ? 'bg-green-50 text-green-800 border border-green-200' 
                                                    : 'bg-red-50 text-red-800 border border-red-200'
                                            }`}>
                                                {resetMessage.text}
                                            </div>
                                        )}
                                        
                                        <button
                                            type="submit"
                                            disabled={resetLoading}
                                            className="py-1 px-4 mb-3 text-left rounded-full whitespace-nowrap text-ellipsis overflow-hidden font-poppinsmedium text-base hover:shadow transition-all text-white"
                                            style={{
                                                userSelect: "none",
                                                backgroundColor: '#CC0000',
                                                opacity: resetLoading ? 0.6 : 1,
                                                cursor: resetLoading ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            {resetLoading ? 'Verzenden...' : 'Wachtwoord opnieuw instellen'}
                                        </button>
                                    </form>
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
