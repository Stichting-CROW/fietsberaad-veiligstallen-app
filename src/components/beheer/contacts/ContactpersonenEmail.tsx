import React, { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Modal from "~/components/Modal";
import FormInput from "~/components/Form/FormInput";
import FormTextarea from "~/components/Form/FormTextarea";
import type { ContactpersonWithStallingen } from "~/pages/api/protected/contactpersonen";
import { removeEmptyShortcodes } from "~/utils/mail-template-utils";
import { titleToSlug } from "~/utils/slug";

const TEMPLATE_KEY = "mail-reminder-aan-contactpersonen";

const DEFAULT_SUBJECT = "VeiligStallen: zijn de fietsenstallingen up to date?";

const DEFAULT_TEMPLATE = `Hallo contactpersoon van [data-eigenaar] in VeiligStallen,

Is de informatie van onderstaande fietsenstallingen nog correct en up to date?

[intro]
[tabel]
[outro]`;

const BASE_URL =
  typeof window !== "undefined"
    ? (process.env.NEXT_PUBLIC_SITE_URL ?? process.env.NEXTAUTH_URL ?? "")
    : "https://beta.veiligstallen.nl";

const P_STYLE = "margin-top:10px;margin-bottom:10px";

function buildTabelHtml(
  fietsenstallingen: { id: string; title: string | null; urlName: string | null }[]
): string {
  const buttons = `<p style="${P_STYLE}"><a href="" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;margin-right:8px" target="_blank">Ja, gecontroleerd</a> <a href="${BASE_URL}/beheer/fietsenstallingen" style="display:inline-block;background:#6b7280;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600" target="_blank">Nee, nu controleren</a></p>`;
  if (fietsenstallingen.length === 0) {
    return `<p style="${P_STYLE}">Geen fietsenstallingen gekoppeld</p>` + buttons;
  }
  const rows = fietsenstallingen.map((s) => {
    const name = s.title ?? "Onbekend";
    const path = s.urlName ? `/${s.urlName}` : "";
    const nameSlug = s.title ? titleToSlug(s.title) : "";
    const qs = new URLSearchParams();
    if (nameSlug) qs.set("name", nameSlug);
    qs.set("stallingid", s.id);
    const bekijkUrl = `${BASE_URL}${path}/?${qs.toString()}`;
    const bewerkUrl = `${BASE_URL}/beheer/fietsenstallingen?id=${s.id}`;
    return `<tr><td><b>${name}</b></td><td><a href="${bekijkUrl}" target="_blank">Bekijk</a></td><td><a href="${bewerkUrl}" target="_blank">Bewerk</a></td></tr>`;
  });
  const table = `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;"><thead><tr><th>Naam fietsenstalling</th><th>Bekijk</th><th>Bewerk</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  return table + buttons;
}

function nl2br(text: string): string {
  return text.replace(/\n/g, "<br />");
}

function renderPreview(
  templateBody: string,
  introText: string,
  outroText: string,
  tabelHtml: string,
  dataEigenaar: string
): string {
  const body = removeEmptyShortcodes(templateBody, introText, outroText);
  return nl2br(body)
    .replace(/\[tabel\]/g, tabelHtml)
    .replace(/\[intro\]/g, nl2br(introText))
    .replace(/\[outro\]/g, nl2br(outroText))
    .replace(/\[data-eigenaar\]/g, dataEigenaar);
}

const ContactpersonenEmail: React.FC = () => {
  const { data: session } = useSession();
  const [step, setStep] = useState<1 | 3>(1);
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [templateBody, setTemplateBody] = useState("");
  const [introText, setIntroText] = useState("");
  const [outroText, setOutroText] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<
    Set<string>
  >(new Set());
  const [contactpersonen, setContactpersonen] = useState<
    ContactpersonWithStallingen[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showTestMailConfirmModal, setShowTestMailConfirmModal] = useState(false);
  const [templateEditValue, setTemplateEditValue] = useState("");

  const fetchContactpersonen = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/protected/contactpersonen");
      const json = (await res.json()) as { data?: ContactpersonWithStallingen[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch");
      setContactpersonen(json.data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout bij ophalen");
    } finally {
      setLoading(false);
    }
  };

  const fetchTemplate = async () => {
    try {
      const res = await fetch(
        `/api/protected/mail-templates/${TEMPLATE_KEY}`
      );
      const json = (await res.json()) as { body?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch template");
      const body = (json.body ?? "").trim() || DEFAULT_TEMPLATE;
      setTemplateBody(body);
      setTemplateEditValue(body);
    } catch (e) {
      console.error("Fetch template error:", e);
    }
  };

  useEffect(() => {
    fetchContactpersonen();
    fetchTemplate();
  }, []);

  const selectAll = () => {
    const ids = contactpersonen.map(
      (c) => `${c.UserID}:${c.ContactID}`
    );
    setSelectedRecipients(new Set(ids));
  };

  const selectNone = () => {
    setSelectedRecipients(new Set());
  };

  const toggleRecipient = (key: string) => {
    setSelectedRecipients((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const saveTemplate = async () => {
    try {
      const res = await fetch(
        `/api/protected/mail-templates/${TEMPLATE_KEY}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: templateEditValue }),
        }
      );
      const json = (await res.json()) as { body?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setTemplateBody(json.body ?? templateEditValue);
      setShowTemplateModal(false);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Fout bij opslaan");
    }
  };

  const getPreviewHtml = () => {
    const c = contactpersonen[0];
    if (!c) return "";
    const tabelHtml = buildTabelHtml(c.fietsenstallingen);
    const dataEigenaar = c.ContactName ?? c.ContactID;
    return renderPreview(
      templateBody,
      introText,
      outroText,
      tabelHtml,
      dataEigenaar
    );
  };

  const openConfirmModal = () => {
    if (!subject.trim()) {
      alert("Vul een mail-onderwerp in.");
      return;
    }
    if (selectedRecipients.size === 0) {
      alert("Selecteer minimaal één ontvanger.");
      return;
    }
    setShowConfirmModal(true);
  };

  const openTestMailConfirmModal = () => {
    if (!subject.trim()) {
      alert("Vul een mail-onderwerp in.");
      return;
    }
    setShowTestMailConfirmModal(true);
  };

  const sendTestMail = async () => {
    setSendingTest(true);
    setError(null);
    try {
      const c = contactpersonen[0];
      const sampleData = c
        ? {
            fietsenstallingen: c.fietsenstallingen,
            dataEigenaar: c.ContactName ?? c.ContactID,
          }
        : {
            fietsenstallingen: [] as { id: string; title: string | null; urlName: string | null }[],
            dataEigenaar: "Voorbeeld",
          };
      const res = await fetch(
        "/api/protected/contactpersonen/send-test-mail",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            templateBody,
            introText,
            outroText,
            sampleData,
          }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Fout bij verzenden");
      setShowTestMailConfirmModal(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout bij verzenden");
    } finally {
      setSendingTest(false);
    }
  };

  const sendMail = async () => {
    setSending(true);
    setError(null);
    try {
      const recipients = Array.from(selectedRecipients).map((key) => {
        const [userId, contactId] = key.split(":");
        return { userId, contactId };
      });
      const res = await fetch(
        "/api/protected/contactpersonen/send-reminder-mail",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject,
            templateBody,
            introText,
            outroText,
            recipients,
          }),
        }
      );
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Fout bij verzenden");
      setShowConfirmModal(false);
      setStep(3);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fout bij verzenden");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-4">E-mail aan contactpersonen</h1>
        <p className="text-gray-600 mb-4">
          Contactpersonen laden...
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">E-mail aan contactpersonen</h1>
      <p className="text-gray-600 mb-6">
        Stuur een e-mail aan de contactpersonen, met een overzicht van de
        stallingen en de vraag om deze te controleren
      </p>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-6">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      {step === 1 && (
        <div className="max-w-2xl space-y-6">
          <div>
            <div className="mb-2">
              <b>Mailsjabloon</b>
            </div>
            <button
              type="button"
              onClick={() => {
                setTemplateEditValue(templateBody);
                setShowTemplateModal(true);
              }}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Update mail sjabloon
            </button>
          </div>

          <div>
            <FormInput
              label="Mail-onderwerp"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Onderwerp van de e-mail"
              required={true}
            />
          </div>

          <div>
            <FormTextarea
              label="Intro text"
              value={introText}
              onChange={(e) => setIntroText(e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <FormTextarea
              label="Outro text"
              value={outroText}
              onChange={(e) => setOutroText(e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block font-bold">
                Ontvangers
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Selecteer alle
                </button>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Selecteer geen
                </button>
              </div>
            </div>
            <div className="border rounded-md max-h-60 overflow-y-auto p-2 space-y-2">
              {contactpersonen.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Geen contactpersonen gevonden
                </p>
              ) : (
                contactpersonen.map((c) => {
                  const key = `${c.UserID}:${c.ContactID}`;
                  const checked = selectedRecipients.has(key);
                  const label = `${c.DisplayName || c.UserName} (${c.ContactName ?? c.ContactID})`;
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleRecipient(key)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="text-sm truncate">{label}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Preview e-mail
            </button>
            <button
              type="button"
              onClick={openTestMailConfirmModal}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              Zend een testmail
            </button>
            <button
              type="button"
              onClick={openConfirmModal}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700"
            >
              Verzend aan geselecteerde contactpersonen
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="max-w-2xl">
          <p className="text-green-700 font-medium">
            E-mail succesvol verzonden. Je hebt een kopie gekregen van alle
            e-mails op het emailadres waarmee je bent ingelogd
          </p>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="mt-6 inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Nog een e-mail versturen
          </button>
        </div>
      )}

      {showTemplateModal && (
        <Modal onClose={() => setShowTemplateModal(false)}>
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">
              Mailsjabloon bewerken
            </h2>
            <p className="text-sm text-gray-600">
              Placeholders: [tabel], [intro], [outro]
            </p>
            <textarea
              value={templateEditValue}
              onChange={(e) => setTemplateEditValue(e.target.value)}
              rows={16}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTemplateModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={saveTemplate}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                Opslaan
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showTestMailConfirmModal && (
        <Modal
          onClose={() => setShowTestMailConfirmModal(false)}
          modalWrapperClassName="modal-wrapper--fit-content"
        >
          <div className="space-y-4">
            <p className="text-gray-700">
              Een testmail wordt verstuurd aan{" "}
              <strong>{session?.user?.email ?? "..."}</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowTestMailConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={sendTestMail}
                disabled={sendingTest}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {sendingTest ? "Verzenden..." : "OK, verzend de testmail"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showPreviewModal && (
        <Modal onClose={() => setShowPreviewModal(false)}>
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Preview e-mail</h2>
            <div className="border rounded-md p-4 bg-white max-h-[70vh] overflow-y-auto">
              <div
                className="prose max-w-none"
                dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
              />
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Terug naar bewerken
              </button>
            </div>
          </div>
        </Modal>
      )}

      {showConfirmModal && (
        <Modal onClose={() => setShowConfirmModal(false)}>
          <div className="space-y-4">
            <h2 className="text-lg font-semibold">Bevestig verzending</h2>
            <div>
              <h3 className="text-sm font-medium mb-2">Preview e-mail</h3>
              <div
                className="border rounded-md p-4 bg-white overflow-y-auto max-h-[200px]"
                dangerouslySetInnerHTML={{ __html: getPreviewHtml() }}
              />
            </div>
            <div>
              <h3 className="text-sm font-medium mb-2">Ontvangers</h3>
              <ul className="list-disc list-inside space-y-1 max-h-32 overflow-y-auto">
                {contactpersonen
                  .filter((c) =>
                    selectedRecipients.has(`${c.UserID}:${c.ContactID}`)
                  )
                  .map((c) => (
                    <li key={`${c.UserID}:${c.ContactID}`}>
                      {c.DisplayName || c.UserName} ({c.ContactName ?? c.ContactID})
                    </li>
                  ))}
              </ul>
            </div>
            {error && (
              <div className="rounded-md bg-red-50 p-3">
                <div className="text-sm text-red-800">{error}</div>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Annuleren
              </button>
              <button
                type="button"
                onClick={sendMail}
                disabled={sending}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {sending ? "Verzenden..." : "Verzend de e-mail"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ContactpersonenEmail;
