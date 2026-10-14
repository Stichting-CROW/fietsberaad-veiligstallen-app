/** Dedicated e2e organisatie on the test database. Torn down after the Playwright run. */

function fixedId(tag: string): string {
  if (tag.length >= 35) throw new Error(tag);
  return tag.padEnd(35, "0");
}

export const PASSWORD = "E2eBuurtstallingen!";

export const URL_A = "e2ebuurt-a";
export const URL_B = "e2ebuurt-b";

export const SITE_A = fixedId("E2EBUURTSITEA");
export const SITE_B = fixedId("E2EBUURTSITEB");
export const EXPLOITANT = fixedId("E2EBUURTEXPLOIT");

export const STALL_A = fixedId("E2EBUURTPARKA");
export const STALL_TROMMEL = fixedId("E2EBUURTPARKT");
export const STALL_B = fixedId("E2EBUURTPARKB");
export const STALL_BEWAAKT = fixedId("E2EBUURTPARKW");

export const SHORT_A = "E2EA0001";
export const SHORT_TROMMEL = "E2ET0001";
export const SHORT_B = "E2EB0001";
export const SHORT_BEWAAKT = "E2EW0001";

export const USER_VIEWER = fixedId("E2EBUURTUSERV");
export const USER_ADMIN = fixedId("E2EBUURTUSERA");
export const USER_ROOT = fixedId("E2EBUURTUSERR");
export const USER_NONE = fixedId("E2EBUURTUSERN");
export const USER_NOMODULE = fixedId("E2EBUURTUSERM");
export const ACCOUNT_CITIZEN = fixedId("E2EBUURTUSERC");
export const ACCOUNT_OCCUPANT = fixedId("E2EBUURTUSERO");
export const ACCOUNT_SECOND = fixedId("E2EBUURTUSERS");
export const ACCOUNT_WAITER = fixedId("E2EBUURTUSERW");

export const ROLE_VIEWER = fixedId("E2EBUURTROLEV");
export const ROLE_ADMIN = fixedId("E2EBUURTROLEA");
export const ROLE_ROOT = fixedId("E2EBUURTROLER");
export const ROLE_NONE = fixedId("E2EBUURTROLEN");
export const ROLE_NOMODULE = fixedId("E2EBUURTROLEM");

export const LINK_CITIZEN = fixedId("E2EBUURTLINKC");
export const LINK_OCCUPANT = fixedId("E2EBUURTLINKO");
export const LINK_SECOND = fixedId("E2EBUURTLINKS");
export const LINK_WAITER = fixedId("E2EBUURTLINKW");

export const DOC_CONTRACT = fixedId("E2EBUURTDOCC");
export const DOC_MACHTIGING = fixedId("E2EBUURTDOCM");
export const DOC_STANDARD = fixedId("E2EBUURTDOCS");
export const PASS_OCCUPANT = fixedId("E2EBUURTPASSO");
export const OCCUPANT_PASS = "111122223333";
export const PORTAL_EMAIL = "e2e-account-portal@example.test";

export const EXPLOITANT_EMAIL = "e2e-buurt-exploitant@example.test";
export const OCCUPANT_EMAIL = "e2e-buurt-occupant@example.test";
export const SECOND_EMAIL = "e2e-buurt-second@example.test";
export const WAITER_EMAIL = "e2e-buurt-waiter@example.test";

export const users = {
  viewer: { id: USER_VIEWER, roleId: ROLE_VIEWER, email: "e2e-buurt-viewer@example.test", role: "viewer", name: "E2E viewer", siteId: SITE_A },
  admin: { id: USER_ADMIN, roleId: ROLE_ADMIN, email: "e2e-buurt-admin@example.test", role: "admin", name: "E2E admin", siteId: SITE_A },
  rootadmin: { id: USER_ROOT, roleId: ROLE_ROOT, email: "e2e-buurt-root@example.test", role: "rootadmin", name: "E2E rootadmin", siteId: SITE_A },
  none: { id: USER_NONE, roleId: ROLE_NONE, email: "e2e-buurt-none@example.test", role: "none", name: "E2E none", siteId: SITE_A },
  nomodule: { id: USER_NOMODULE, roleId: ROLE_NOMODULE, email: "e2e-buurt-nomodule@example.test", role: "viewer", name: "E2E zonder module", siteId: SITE_B },
} as const;

export const citizen = {
  id: ACCOUNT_CITIZEN,
  email: "e2e-buurt-citizen@example.test",
  firstName: "E2E",
  lastName: "Citizen",
};

export const MAIL_CAPTURE = "e2e/buurtstallingen/.mail-capture.jsonl";

export const people = [
  { id: ACCOUNT_CITIZEN, link: LINK_CITIZEN, email: citizen.email, first: "E2E", last: "Citizen" },
  { id: ACCOUNT_OCCUPANT, link: LINK_OCCUPANT, email: OCCUPANT_EMAIL, first: "E2E", last: "Bezet" },
  { id: ACCOUNT_SECOND, link: LINK_SECOND, email: SECOND_EMAIL, first: "E2E", last: "Tweede" },
  { id: ACCOUNT_WAITER, link: LINK_WAITER, email: WAITER_EMAIL, first: "E2E", last: "Wacht" },
] as const;
