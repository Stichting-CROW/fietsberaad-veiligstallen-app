import React, { useRef } from "react";
import { useRouter } from 'next/navigation'
import useQueryParam from '../../hooks/useQueryParam';

// import bcrypt from 'bcrypt'

// Import utils
// import { getParkingsFromDatabase } from "~/utils/prisma";

// Import components
import PageTitle from "~/components/PageTitle";
import FormInput from "~/components/Form/FormInput";
import FormCheckbox from "~/components/Form/FormCheckbox";
import AppHeaderDesktop from "~/components/AppHeaderDesktop";
import { Button } from "~/components/Button";
import { signIn } from "next-auth/react";



// import ImageSlider from "~/components/ImageSlider";
// import HorizontalDivider from "~/components/HorizontalDivider";
// import CloseButton from "~/components/CloseButton";
// import Parking from "~/components/Parking";

import Styles from "./error.module.css";
import { type NextPage } from "next/types";
import Head from "next/head";
import AppHeader from "~/components/AppHeader";

const VerifyRequest: NextPage = () => {

    const router = useRouter()
    const theError = useQueryParam("error")[0] || '';

    const onConfirm = async (e: React.MouseEvent<HTMLButtonElement>) => {
        router.push('/login')
    };

    const renderError = (err: string): string => {
        if (err === 'CredentialsSignin') {
            return 'Controleer je inloggegevens'
        }
        return '';
    }

    return (
        <>
            <Head>
                <title>
                    Login - VeiligStallen
                </title>
            </Head>
            <div className="flex flex-col justify-between" style={{ height: '100dvh' }}>

                <AppHeader />

                <div className={`${Styles.LoginPage}`}>

                    <div className={`
						${Styles.ErrorBox}
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
                            data-name="Error-form"
                            className="
								flex-1

								flex
								flex-col
								justify-around
							"
                        >
                            <div data-name="Some spacing" className="h-0">

                            </div>
                            <div data-name="Title and Error form" className="mb-8">
                                <PageTitle className="flex flex-col justify-center hidden sm:block">
                                    <div>
                                        <img src="/images/logo-without-text.png" alt="VeiligStallen logo"
                                            className="inline-block mr-6"
                                            style={{ height: '60px' }}
                                        />
                                        <b>Open je mailbox</b>
                                    </div>
                                </PageTitle>
                                <p>
                                    {/* <b>{renderError(theError)}</b> */}
                                    We hebben een inlog-link verstuurd naar je mailadres. Klik hierop om in te loggen.
                                </p>
                            </div>
                            <div className="flex justify-end">
                                <Button
                                    style={{
                                        marginTop: '0.5rem',
                                        marginBottom: '0.5rem',
                                    }}
                                    onClick={onConfirm}
                                >
                                    Terug naar login
                                </Button>
                            </div>

                            <div data-name="Footer: Contact helpdesk">
                                <div className="text-center">
                                    <a href="/contact" className="underline text-sm hidden">
                                        Contact helpdesk
                                    </a>
                                </div>
                            </div>

                        </div>
                    </div>

                </div>
            </div>
        </>
    );
};

export default VerifyRequest;
