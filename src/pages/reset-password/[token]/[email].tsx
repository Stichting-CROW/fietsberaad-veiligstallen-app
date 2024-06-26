import React from 'react'
// import axios from 'axios'
import { ErrModal, SuccessModal } from '~/components/Modals'
// import { authEndpoints } from '../endpoints'

const DefaultResetPassword = () => {
    const [resetSuccess, setResestSuccess] = React.useState()
    const [resetError, setResetError] = React.useState()

    const [email, setEmail] = React.useState('')
    const [loading, setLoading] = React.useState(false)

    const handleForgot = async (e) => {
        e.preventDefault()
        try {
            setLoading(true)
            const response = await axios({
                method: 'POST',
                url: '',//authEndpoints.recover,
                data: {
                    email,
                },
                headers: {
                    'Content-Type': 'application/json',
                }
            });
            setLoading(false)
            const { data } = error.response
            setResetError(data.msg);
            setResestSuccess(null);
        } catch (err) {
            console.error(err)
        }
    }

    return (
        <div>
            {resetError ? <ErrModal message={resetError} /> : null}
            {resetSuccess ? <SuccessModal message={resetSuccess} /> : null}
            <form onSubmit={handleForgot} className="reset-password">
                <h1>Forgot Password </h1>
                <p>
                    You are not alone.We’ve all been here at some point.
                </p>
                <div>
                    <label htmlFor="email">
                        Email address
                    </label>
                    <input
                        type="email"
                        name="email"
                        id="email"
                        placeholder="your email address"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                    />
                </div>
                <button name="reset-pwd-button" className="reset-pwd">
                    {!loading ? 'Get secure link' : 'Sending...'}
                </button>
            </form>
        </div>
    )
}

export default DefaultResetPassword;
