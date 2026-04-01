import React, { useEffect, useState } from "react";
import TipTapEditor from "~/components/common/TipTapEditor";
import { notifyError, notifySuccess } from "~/utils/client/notifications";

const TEMPLATE_KEY = "mail-reminder-aan-contactpersonen";

const DEFAULT_TEMPLATE = `Beste contactpersoon van [data-eigenaar] in VeiligStallen,

Is de informatie van onderstaande fietsenstallingen nog correct en up to date?

[tabel]

Met vriendelijke groet,
VeiligStallen`;

function removeUnusedPlaceholders(template: string): string {
  return template.replace(/\[intro\]/gi, "").replace(/\[outro\]/gi, "");
}

const Mailsjabloon: React.FC = () => {
  const [templateEditValue, setTemplateEditValue] = useState("");

  const fetchTemplate = async () => {
    try {
      const res = await fetch(`/api/protected/mail-templates/${TEMPLATE_KEY}`);
      const json = (await res.json()) as { body?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch template");
      const body = (json.body ?? "").trim() || DEFAULT_TEMPLATE;
      setTemplateEditValue(removeUnusedPlaceholders(body));
    } catch (e) {
      console.error("Fetch template error:", e);
    }
  };

  useEffect(() => {
    fetchTemplate();
  }, []);

  const saveTemplate = async () => {
    try {
      const normalizedTemplate = removeUnusedPlaceholders(templateEditValue);
      const res = await fetch(`/api/protected/mail-templates/${TEMPLATE_KEY}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: normalizedTemplate }),
      });
      const json = (await res.json()) as { body?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed to save");
      setTemplateEditValue(removeUnusedPlaceholders(json.body ?? normalizedTemplate));
      notifySuccess("Mailsjabloon opgeslagen");
    } catch (e) {
      notifyError(e instanceof Error ? e.message : "Fout bij opslaan");
    }
  };

  return (
    <div className="p-6">
      <div className="space-y-4 max-w-4xl">
        <h1 className="text-3xl font-bold">Mailsjabloon</h1>
        <p>
          Dit is het mailsjabloon dat wordt gebruikt voor de e-mail aan de contactpersonen. Als er een automatische e-mail wordt verstuurd, is dit de mailtekst. Bij het handmatig versturen van een e-mail, wordt dit sjabloon automatisch ingeladen als basis.
        </p>
        <p className="text-sm text-gray-600">
          Placeholders: [data-eigenaar], [tabel]
        </p>
        <TipTapEditor
          value={templateEditValue}
          onChange={setTemplateEditValue}
          placeholder="Schrijf het mailsjabloon..."
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={saveTemplate}
            className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
          >
            Opslaan
          </button>
        </div>
      </div>
    </div>
  );
};

export default Mailsjabloon;
