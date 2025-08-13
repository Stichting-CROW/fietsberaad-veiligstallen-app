import crypto from 'crypto';

interface TokenData {
    userid: string;
    validTo: number;
}

interface TokenResponse {
    token: string;
    validTo: number;
}

const ALGORITHM = 'sha256';
const TOKEN_VALIDITY_MILLISECONDS = 2000; // 2 seconds validity

/**
 * Generates a signed token for email and contactId
 * @param email User's email address
 * @param contactId User's contact ID
 * @returns Object containing token and validity timestamp, or false if generation fails
 */
export function calculateAuthToken(
    UserID: string
): TokenResponse | false {
    try {
        // Get private key from environment
        const signerKey = process.env.LOGINTOKEN_SIGNER_PRIVATE_KEY;
        if (!signerKey) {
            console.error('calculateAuthToken - missing signer private key');
            return false;
        }

        // Calculate validity timestamp
        const validTo = Date.now() + TOKEN_VALIDITY_MILLISECONDS;

        // Prepare data for signing
        const tokenData: TokenData = {
            userid: UserID.toLowerCase(),
            validTo
        };

        // Create signature
        const dataString = JSON.stringify(tokenData);
        const hmac = crypto.createHmac(ALGORITHM, signerKey);
        hmac.update(dataString);
        const signature = hmac.digest('hex');

        // Combine data and signature into token
        const token = Buffer.from(JSON.stringify({
            data: tokenData,
            signature
        })).toString('base64');

        return { token, validTo };

    } catch (ex: unknown) {
        console.error('calculateAuthToken - unable to calculate token', ex);
        return false;
    }
}

/**
 * Validates a token and returns the contained data if valid
 * @param token The token to validate
 * @returns TokenData if valid, false if invalid
 */
export function checkToken(token: string): TokenData | false {
    try {
        // Get private key from environment
        const signerKey = process.env.LOGINTOKEN_SIGNER_PRIVATE_KEY;
        if (!signerKey) {
            console.error('checkToken - missing signer private key');
            return false;
        }

        // Decode token
        const decodedToken = Buffer.from(token, 'base64').toString();
        const { data, signature } = JSON.parse(decodedToken);

        // Verify signature
        const hmac = crypto.createHmac(ALGORITHM, signerKey);
        hmac.update(JSON.stringify(data));
        const calculatedSignature = hmac.digest('hex');

        if (calculatedSignature !== signature) {
            console.error('checkToken - invalid signature');
            return false;
        }

        // Check token expiration
        if (data.validTo < Math.floor(Date.now() / 1000)) {
            console.error('checkToken - token expired');
            return false;
        }

        return data as TokenData;

    } catch (ex: unknown) {
        console.error('checkToken - unable to validate token', ex);
        return false;
    }
} 