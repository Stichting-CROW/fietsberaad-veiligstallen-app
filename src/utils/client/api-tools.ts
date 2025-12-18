type ApiSuccess<T> = {
    success: true;
    result: T;
};

type ApiError = {
    success: false;
    error: string;
    details?: string;
};

type ApiResponse<T> = ApiSuccess<T> | ApiError;

// Helper function to make client-side API calls
export async function makeClientApiCall<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
): Promise<ApiResponse<T>> {
    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        const response = await fetch(endpoint, {
            method,
            headers,
            credentials: 'include', // Include cookies for authentication
            ...(body && { body: JSON.stringify(body) })
        });

        const data = await response.json();

        if (!response.ok) {
            // Try to parse error response as JSON
            let errorMessage = `HTTP error! status: ${response.status}`;
            let errorDetails: string | undefined;
            if (data.error) {
                errorMessage = data.error;
                if (data.details) {
                    errorDetails = data.details;
                }
            }
            return {
                success: false,
                error: errorMessage,
                details: errorDetails
            };
        }
        return {
            success: true,
            result: data
        };
    } catch (error) {
        console.error('API call error:', error);
        return {
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error occurred'
        };
    }
} 