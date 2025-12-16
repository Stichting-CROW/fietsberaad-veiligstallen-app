export type BeheerderContactResult = {
  visible: boolean;
  beheerder: string;
  beheerdercontact: string;
};

/**
 * Old display logic for beheerder/helpdesk:
 * - exploitant not set, beheerder not set -> dont display beheerder section
 * - exploitant not set, beheerder set -> visible (clickable if beheerderContact is set)
 * - exploitant set, beheerder not set -> visible (default helpdesk)
 * - exploitant set, beheerder set -> visible (default helpdesk)
 */
export function getBeheerderContactOld(
  exploitantID: string | null,
  beheerder: string | null,
  beheerderContact: string | null,
  exploitantCompanyName?: string | null,
  exploitantHelpdesk?: string | null,
  siteCompanyName?: string | null,
  siteHelpdesk?: string | null
): BeheerderContactResult {
  const hasExploitant = exploitantID !== null && exploitantID !== "";
  const hasBeheerder = beheerder && beheerder.trim() !== "";
  
  // Determine visibility: visible if (exploitant not set AND beheerder set) OR (exploitant set)
  const visible = (!hasExploitant && hasBeheerder) || hasExploitant;
  
  let beheerderResult = "";
  let beheerdercontact = "";
  
  if (hasExploitant) {
    // If exploitant is set, use exploitant's company name and helpdesk
    beheerderResult = exploitantCompanyName || "";
    beheerdercontact = exploitantHelpdesk || "";
  } else if (hasBeheerder) {
    // If beheerder field is set, use it
    beheerderResult = beheerder || "";
    beheerdercontact = beheerderContact || "";
  } else {
    // Fallback to siteID contact (data owner)
    beheerderResult = siteCompanyName || "";
    beheerdercontact = siteHelpdesk || "";
  }
  
  return {
    visible,
    beheerder: beheerderResult || "",
    beheerdercontact: beheerdercontact || "",
  };
}

/**
 * New display logic for beheerder/helpdesk:
 * - helpdesk standaard -> visible
 *   - exploitant not set -> visible (company name data owner, default helpdesk data-owner)
 *   - exploitant set -> visible (company name exploitant, default helpdesk exploitant)
 * - helpdesk anders -> visible (beheerder, beheerder contact)
 * - control is not shown if beheerder or beheerdercontact are not set (when using helpdesk anders)
 */
export function getBeheerderContactNew(
  exploitantID: string | null,
  beheerder: string | null,
  beheerderContact: string | null,
  helpdeskHandmatigIngesteld: boolean | null,
  exploitantCompanyName?: string | null,
  exploitantHelpdesk?: string | null,
  siteCompanyName?: string | null,
  siteHelpdesk?: string | null
): BeheerderContactResult {
  const isHandmatigIngesteld = helpdeskHandmatigIngesteld === true;
  const hasExploitant = exploitantID !== null && exploitantID !== "";
  const hasBeheerder = !!(beheerder && beheerder.trim() !== "");
  const hasBeheerderContact = !!(beheerderContact && beheerderContact.trim() !== "");
  
  let visible = false;
  let beheerderResult = "";
  let beheerdercontact = "";
  
  if (isHandmatigIngesteld) {
    // Helpdesk anders: only visible if beheerder OR beheerderContact is set
    visible = hasBeheerder;
    beheerderResult = beheerder || "";
    beheerdercontact = beheerderContact || "";
  } else {
    // Helpdesk standaard: always visible
    
    if (hasExploitant) {
      // Use exploitant's company name and helpdesk
      beheerderResult = exploitantCompanyName || "";
      beheerdercontact = exploitantHelpdesk || "";
    } else {
      // Use data owner's (SiteID) company name and helpdesk
      beheerderResult = siteCompanyName || "";
      beheerdercontact = siteHelpdesk || "";
    }

    visible = beheerderResult !== "" && beheerdercontact !== "";
  }
  
  return {
    visible,
    beheerder: beheerderResult || "",
    beheerdercontact: beheerdercontact || "",
  };
}

/**
 * Formats a contact string (email or URL) into a proper link
 * Returns an object with href and display text
 */
export function formatBeheerderContactLink(beheerdercontact: string): {
  href: string;
  displayText: string;
} {
  if (!beheerdercontact || beheerdercontact.trim() === "") {
    return { href: "", displayText: "" };
  }
  
  const trimmed = beheerdercontact.trim();
  
  // Check if it's an email address
  if (trimmed.includes("@")) {
    return {
      href: `mailto:${trimmed}`,
      displayText: trimmed,
    };
  }
  
  // Check if it's already a full URL
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return {
      href: trimmed,
      displayText: trimmed,
    };
  }
  
  // Check if it starts with www
  if (trimmed.startsWith("www.")) {
    return {
      href: `https://${trimmed}`,
      displayText: trimmed,
    };
  }
  
  // Default: treat as URL and prepend https://
  return {
    href: `https://${trimmed}`,
    displayText: trimmed,
  };
}

