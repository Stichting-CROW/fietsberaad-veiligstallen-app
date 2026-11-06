import assert from "node:assert/strict";
import test from "node:test";
import { displayPhone, documentPage, logoUrl } from "./documents";

test("a file name is served from the static logo library", () => {
  assert.equal(logoUrl("utrecht.png"), "https://static.veiligstallen.nl/library/logo/utrecht.png");
  assert.equal(logoUrl("https://cdn.example/logo.png"), "https://cdn.example/logo.png");
  assert.equal(logoUrl("  "), "https://fms.veiligstallen.nl/resources/client/logo.png");
  assert.equal(logoUrl("[local]/uploads/logo.png"), "/api/uploads/logo.png");
});

test("display phone joins a fixed number and a mobile number", () => {
  assert.equal(displayPhone("020-1", "06-2"), "020-1 / 06-2");
  assert.equal(displayPhone("020-1", "  "), "020-1");
  assert.equal(displayPhone("", "06-2"), "06-2");
  assert.equal(displayPhone(null, null), "");
});

test("the printable page centers the logo and keeps the filled template", () => {
  const page = documentPage({
    title: 'Contract "A"',
    body: "<p>Naam</p>",
    logoUrl: "https://static.veiligstallen.nl/library/logo/a.png",
    logoAlt: "Testgemeente",
  });
  assert.match(page, /<img src="https:\/\/static.veiligstallen.nl\/library\/logo\/a.png" alt="Testgemeente" onerror="[^"]*fms.veiligstallen.nl\/resources\/client\/logo.png[^"]*">/);
  assert.match(page, /<p>Naam<\/p>/);
  assert.match(page, /Contract &quot;A&quot;/);
});
