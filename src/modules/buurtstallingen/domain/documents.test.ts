import assert from "node:assert/strict";
import test from "node:test";
import { documentPage, logoUrl } from "./documents";

test("a file name is served from the static logo library", () => {
  assert.equal(logoUrl("utrecht.png"), "https://static.veiligstallen.nl/library/logo/utrecht.png");
  assert.equal(logoUrl("https://cdn.example/logo.png"), "https://cdn.example/logo.png");
  assert.equal(logoUrl("  "), "https://fms.veiligstallen.nl/resources/client/logo.png");
});

test("the printable page centers the logo and keeps the filled template", () => {
  const page = documentPage({
    title: 'Contract "A"',
    body: "<p>Naam</p>",
    logoUrl: "https://static.veiligstallen.nl/library/logo/a.png",
    logoAlt: "Testgemeente",
  });
  assert.match(page, /<img src="https:\/\/static.veiligstallen.nl\/library\/logo\/a.png" alt="Testgemeente">/);
  assert.match(page, /<p>Naam<\/p>/);
  assert.match(page, /Contract &quot;A&quot;/);
});
