import React, { useEffect, useState } from "react";
import type { UitzonderingOpeningstijden } from "~/types/parking";
import SectionBlock from "~/components/SectionBlock";
import Modal from "~/components/Modal";
import FormInput from "~/components/Form/FormInput";
import FormTimeInput from "~/components/Form/FormTimeInput";
import FormCheckbox from "~/components/Form/FormCheckbox";
import moment from "moment";

interface ParkingOpeningUitzonderingenProps {
  fietsenstallingID: string;
  editMode: boolean;
}

const API_URL = "/api/protected/fietsenstallingen/uitzonderingenopeningstijden";

const formatDate = (date: string | Date | null) => {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
};

const formatDateOnly = (date: string | Date | null) => {
  if (!date) return "";
  return moment.utc(date).format("YYYY-MM-DD");
};

const formatTimeOnly = (date: string | Date | null) => {
  if (!date) return "";
  return moment.utc(date).format("HH:mm");
};

const isNextDay = (base: string | Date | null, compare: string | Date | null) => {
  if (!base || !compare) return false;
  const baseDate = moment.utc(base);
  const compareDate = moment.utc(compare);
  return !compareDate.isSame(baseDate, 'day');
};

const isFutureOrToday = (date: string | Date | null) => {
  if (!date) return false;
  const d = moment.utc(date);
  const now = moment.utc().startOf('day');
  return d.isSameOrAfter(now);
};

const emptyRecord: Partial<UitzonderingOpeningstijden> = {
  openingDateTime: null,
  closingDateTime: null,
};

const ParkingOpeningUitzonderingen: React.FC<ParkingOpeningUitzonderingenProps> = ({ fietsenstallingID, editMode }) => {
  const [records, setRecords] = useState<UitzonderingOpeningstijden[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editRecord, setEditRecord] = useState<UitzonderingOpeningstijden | null>(null);
  const [deleteRecord, setDeleteRecord] = useState<UitzonderingOpeningstijden | null>(null);
  const [form, setForm] = useState<Partial<UitzonderingOpeningstijden>>(emptyRecord);
  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [showAll, setShowAll] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}?fietsenstallingID=${fietsenstallingID}`);
      const data = await res.json();
      console.log('++++ data', data);
      setRecords((data.data || []).sort((a: UitzonderingOpeningstijden, b: UitzonderingOpeningstijden) => {
        const aDate = a.openingDateTime ? moment.utc(a.openingDateTime).valueOf() : 0;
        const bDate = b.openingDateTime ? moment.utc(b.openingDateTime).valueOf() : 0;
        return bDate - aDate;
      }));
    } catch (e) {
      setError("Fout bij laden van uitzonderingen.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line
  }, [fietsenstallingID]);

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/protected/fietsenstallingen/uitzonderingenopeningstijden/new?id=new&fietsenstallingID=${fietsenstallingID}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, fietsenstallingsID: fietsenstallingID }),
      });
      if (!res.ok) throw new Error("Fout bij toevoegen.");
      setShowAdd(false);
      setForm(emptyRecord);
      fetchData();
    } catch (e) {
      setError("Fout bij toevoegen.");
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (record: UitzonderingOpeningstijden) => {
    setEditRecord(record);
    setForm({ ...record });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRecord) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}?fietsenstallingID=${fietsenstallingID}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, ID: editRecord.ID }),
      });
      if (!res.ok) throw new Error("Fout bij bewerken.");
      setEditRecord(null);
      setForm(emptyRecord);
      fetchData();
    } catch (e) {
      setError("Fout bij bewerken.");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (record: UitzonderingOpeningstijden) => {
    setDeleteRecord(record);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteRecord) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/protected/fietsenstallingen/uitzonderingenopeningstijden/${deleteRecord.ID}?fietsenstallingID=${fietsenstallingID}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Fout bij verwijderen.");
      setDeleteRecord(null);
      fetchData();
    } catch (e) {
      setError("Fout bij verwijderen.");
    } finally {
      setLoading(false);
    }
  };

  const openAddDialog = () => {
    setForm(emptyRecord);
    setDialogMode('add');
    setShowDialog(true);
  };

  const openEditDialog = (record: UitzonderingOpeningstijden) => {
    setForm({ ...record });
    setEditRecord(record);
    setDialogMode('edit');
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditRecord(null);
    setForm(emptyRecord);
  };

  const handleDialogSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const openingDateTime = form.openingDateTime ? moment.utc(form.openingDateTime).toISOString() : null;
      const closingDateTime = form.closingDateTime ? moment.utc(form.closingDateTime).toISOString() : null;
      if (dialogMode === 'add') {
        const res = await fetch(`/api/protected/fietsenstallingen/uitzonderingenopeningstijden/new?id=new&fietsenstallingID=${fietsenstallingID}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, openingDateTime, closingDateTime, fietsenstallingsID: fietsenstallingID }),
        });
        if (!res.ok) throw new Error("Fout bij toevoegen.");
      } else if (dialogMode === 'edit' && editRecord) {
        const res = await fetch(`/api/protected/fietsenstallingen/uitzonderingenopeningstijden/${editRecord.ID}?fietsenstallingID=${fietsenstallingID}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...form, openingDateTime, closingDateTime, ID: editRecord.ID }),
        });
        if (!res.ok) throw new Error("Fout bij bewerken.");
      }
      closeDialog();
      fetchData();
    } catch (e) {
      setError("Fout bij opslaan.");
    } finally {
      setLoading(false);
    }
  };

  if (!editMode) {
    return (
      <SectionBlock heading="Uitzonderingen" contentClasses="w-full">
        {error && <div style={{ color: "red" }}>{error}</div>}
        {loading && <div>Laden...</div>}
        <table className="w-full mb-4">
          <thead>
            <tr>
              <th>Dag</th>
              <th>Tijden</th>
            </tr>
          </thead>
          <tbody>
            {records.filter(r => isFutureOrToday(r.closingDateTime)).length === 0 && (
              <tr><td colSpan={3}>Geen uitzonderingen</td></tr>
            )}
            {records.filter(r => isFutureOrToday(r.closingDateTime)).map((r) => (
              <tr key={r.ID}>
                <td>{formatDateOnly(r.openingDateTime)}</td>
                <td>
                  {formatTimeOnly(r.openingDateTime)}
                  &nbsp;-&nbsp;
                  {formatTimeOnly(r.closingDateTime)}
                  {isNextDay(r.openingDateTime, r.closingDateTime) ? " [+1]" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionBlock>
    );
  }

  return (
    <div>
      <SectionBlock heading="Uitzonderingen openingstijden" contentClasses="w-full">
      <div className="flex items-center justify-between w-full mb-6">
        <div className="font-bold"></div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showAll}
              onChange={e => setShowAll(e.target.checked)}
            />
            <span>Toon geschiedenis</span>
          </label>
          <button
            onClick={openAddDialog}
            className="bg-gray-200 text-gray-800 rounded px-4 py-2 hover:bg-gray-300 transition"
          >
            Toevoegen
          </button>
        </div>
      </div>
        {error && <div style={{ color: "red" }}>{error}</div>}
        {loading && <div>Laden...</div>}
        <table className="w-full mb-4">
          {records.filter(r => showAll || isFutureOrToday(r.closingDateTime)).length > 0 && (
            <thead>
              <tr>
                <th className="text-center">Dag</th>
                <th className="text-center">Tijden</th>
                <th className="text-right">Acties</th>
              </tr>
            </thead>
          )}
          <tbody>
            {records.filter(r => showAll || isFutureOrToday(r.closingDateTime)).map((r) => (
              <tr key={r.ID}>
                <td className="text-center">{formatDateOnly(r.openingDateTime)}</td>
                <td className="text-center">
                  {formatTimeOnly(r.openingDateTime)}
                  &nbsp;-&nbsp;
                  {formatTimeOnly(r.closingDateTime)}
                  {isNextDay(r.openingDateTime, r.closingDateTime) ? " [+1]" : ""}
                </td>
                <td className="text-right">
                  <div className="inline-flex">
                    <button
                      onClick={() => openEditDialog(r)}
                      aria-label="Bewerk"
                      className="bg-transparent rounded p-1 hover:bg-gray-200 transition mr-2"
                      style={{ lineHeight: 0 }}
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" className="text-gray-500">
                        <path d="M12.146 2.854a.5.5 0 0 1 .708 0l.292.292a.5.5 0 0 1 0 .708l-8.5 8.5a.5.5 0 0 1-.168.11l-2.5 1a.5.5 0 0 1-.65-.65l1-2.5a.5.5 0 0 1 .11-.168l8.5-8.5zM11.207 3.5L12.5 4.793 13.793 3.5 12.5 2.207 11.207 3.5z" strokeWidth="1"/>
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDelete(r)}
                      aria-label="Verwijder"
                      className="bg-transparent rounded p-1 hover:bg-gray-200 transition"
                      style={{ lineHeight: 0 }}
                    >
                      <svg width="16" height="16" fill="none" viewBox="0 0 16 16" stroke="currentColor" className="text-gray-500">
                        <path d="M6 6v6m4-6v6M2 4h12M3 4v9a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V4" strokeWidth="1"/>
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {records.filter(r => showAll || isFutureOrToday(r.closingDateTime)).length === 0 && (
              <tr><td colSpan={4}>Geen uitzonderingen</td></tr>
            )}
          </tbody>
        </table>
      </SectionBlock>
      {showDialog && (
        <Modal onClose={closeDialog} title={dialogMode === 'add' ? 'Uitzondering toevoegen' : 'Uitzondering bewerken'}>
          <form onSubmit={handleDialogSave}>
            <FormInput
              type="date"
              label="Datum"
              value={form.openingDateTime ? moment.utc(form.openingDateTime).format("YYYY-MM-DD") : ""}
              onChange={e => {
                const date = e.target.value;
                // preserve time if present
                let open = form.openingDateTime ? moment.utc(form.openingDateTime) : moment.utc();
                let close = form.closingDateTime ? moment.utc(form.closingDateTime) : moment.utc();
                open.year(Number(date.slice(0, 4))).month(Number(date.slice(5, 7)) - 1).date(Number(date.slice(8, 10)));
                close.year(Number(date.slice(0, 4))).month(Number(date.slice(5, 7)) - 1).date(Number(date.slice(8, 10)));
                setForm({ ...form, openingDateTime: open.toDate(), closingDateTime: close.toDate() });
              }}
              required
            />
            <div className="flex flex-row items-center gap-4">
              <FormTimeInput
                label="Open tijd"
                value={form.openingDateTime ? moment.utc(form.openingDateTime).toDate() : null}
                onChange={date => {
                  let open = date ? moment.utc(date).toDate() : null;
                  setForm({ ...form, openingDateTime: open });
                }}
                required
              />
              <FormTimeInput
                label="Dicht tijd"
                value={form.closingDateTime ? moment.utc(form.closingDateTime).toDate() : null}
                onChange={date => {
                  let close = date ? moment.utc(date).toDate() : null;
                  setForm({ ...form, closingDateTime: close });
                }}
                required
              />
            </div>
            <div className="flex flex-row gap-4 mt-4">
              <button
                type="submit"
                className="bg-gray-200 text-gray-800 rounded px-4 py-2 hover:bg-gray-300 transition"
              >
                Opslaan
              </button>
              <button
                type="button"
                onClick={closeDialog}
                className="bg-gray-100 text-gray-800 rounded px-4 py-2 hover:bg-gray-200 transition"
              >
                Annuleer
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleteRecord && (
        <div className="mt-4">
          Weet je zeker dat je deze uitzondering wilt verwijderen?
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleDeleteConfirm}
              className="bg-gray-200 text-gray-800 rounded px-4 py-2 hover:bg-gray-300 transition"
            >
              Ja
            </button>
            <button
              onClick={() => setDeleteRecord(null)}
              className="bg-gray-100 text-gray-800 rounded px-4 py-2 hover:bg-gray-200 transition"
            >
              Nee
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParkingOpeningUitzonderingen; 