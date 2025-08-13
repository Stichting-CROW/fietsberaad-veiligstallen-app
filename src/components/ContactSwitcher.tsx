import { sessionService } from "~/utils/sessionService";
import { useSession } from "next-auth/react";
import { useState } from "react";

export function ContactSwitcher({ contacts }: { contacts: string[] }) {
    const { data: session, update: updateSession } = useSession();
    const [isLoading, setIsLoading] = useState(false);

    const handleContactSwitch = async (newContactId: string) => {
        if (!session) return;
        
        setIsLoading(true);
        try {
            const response = await fetch('/api/security/switch-contact', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ contactId: newContactId })
            });

            if (!response.ok) {
                alert("Het wisselen van contact is niet gelukt");
                return;
            }

            const { user } = await response.json();
            
            // Update the session with new user data
            await updateSession({
                ...session,
                user
            });

        } catch (error) {
            console.error('Error switching contact:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div>
            <select 
                value={session?.user?.activeContactId || ''} 
                onChange={(e) => handleContactSwitch(e.target.value)}
                disabled={isLoading}
            >
                {contacts.map(contactId => (
                    <option key={contactId} value={contactId}>
                        {contactId}
                    </option>
                ))}
            </select>
            {isLoading && <span>Switching contact...</span>}
        </div>
    );
} 