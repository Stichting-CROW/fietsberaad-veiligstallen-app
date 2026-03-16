import React, { useState } from "react";
import Modal from "~/components/Modal";
import type { Session } from "next-auth";

interface StallingsdataControleModalProps {
  onClose: () => void;
  session: Session | null;
}

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export function StallingsdataControleModal({
  onClose,
  session,
}: StallingsdataControleModalProps) {
  const [checked, setChecked] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  const handleCloseClick = (e?: React.MouseEvent) => {
    if(e) e.preventDefault();
    onClose();
  };

  const handleBevestigen = (e: React.FormEvent) => {
    e.preventDefault();
    if (checked) {
      setConfirmed(true);
    }
  };

  const userName = session?.user?.name ?? "";
  const userEmail = session?.user?.email ?? "";
  const displayUser = [userName, userEmail].filter(Boolean).join(" - ") || "Onbekend";

  return (
    <Modal onClose={onClose} title="Stallingsdata controle" clickOutsideClosesDialog={false}>
      <h2 className="text-xl font-bold mb-4">Stallingsdata controle</h2>
      <p className="mb-4">
        Op deze pagina kun je aangeven of de datakwaliteit van de stallingen juist is.
        Periodiek vragen we je deze te controleren. De procedure is als volgt:
      </p>
      <ol className="list-decimal list-inside mb-6 space-y-2">
        <li>
          Controleer de data van de stallingen in{" "}
          <a
            href="#"
            onClick={(e) => handleCloseClick(e)}
            className="text-blue-600 underline hover:text-blue-800"
          >
            de stallingenlijst
          </a>
        </li>
        <li>
          Zijn er wijzigingen nodig? Pas de wijzigingen direct toe
        </li>
        <li>
          Heb je alle stallingen gecontroleerd en is de data op orde? Bevestig
          dit dan middels onderstaand formulier
        </li>
      </ol>

      {!confirmed ? (
        <form onSubmit={handleBevestigen} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Datum/tijd
            </label>
            <div className="p-2 bg-gray-100 rounded border text-gray-700">
              {formatDateTime(new Date())}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Gecontroleerd door
            </label>
            <div className="p-2 bg-gray-100 rounded border text-gray-700">
              {displayUser}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => setChecked(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span>
                Ik heb de informatie over alle stallingen gecontroleerd
              </span>
            </label>
          </div>
          <button
            type="submit"
            disabled={!checked}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Bevestigen
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <button
              onClick={(e) => handleCloseClick(e)}
              className="flex items-center gap-2 px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium hover:bg-yellow-200 transition-colors text-left"
          >
            <span className="text-yellow-600 text-lg">✅</span>
            <div>
              Je hebt de datakwaliteit van de stallingen gecontroleerd en bevestigd
              dat alle informatie op orde is. Dankjewel hiervoor! Je kunt dit
              venster{" "}
              <a
                href="#"
                className="text-blue-600 underline hover:text-blue-800"
              >
                nu sluiten
              </a>
            </div>
          </button>
        </div>
      )}
    </Modal>
  );
}
