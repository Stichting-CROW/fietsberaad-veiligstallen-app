import React, { useEffect, useState } from "react";
import type { UitzonderingOpeningstijden } from "~/types/parking";
import SectionBlock from "~/components/SectionBlock";
import Modal from "~/components/Modal";
import FormInput from "~/components/Form/FormInput";
import FormRadio from "~/components/Form/FormRadio";
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

const formatTimeDisplay = (openingDateTime: string | Date | null, closingDateTime: string | Date | null) => {
  if (!openingDateTime || !closingDateTime) {
    return "Onbekend";
  }
  
  const open = moment.utc(openingDateTime);
  const close = moment.utc(closingDateTime);
  
  const isOpen24 = open.hours() === 0 && open.minutes() === 0 && close.hours() === 23 && close.minutes() === 59;
  const isGesloten = open.hours() === 0 && open.minutes() === 0 && close.hours() === 0 && close.minutes() === 0;
  
  if (isOpen24) {
    return "Gehele dag geopend";
  }
  if (isGesloten) {
    return "Gehele dag gesloten";
  }
  
  return `${formatTimeOnly(openingDateTime)} - ${formatTimeOnly(closingDateTime)}${isNextDay(openingDateTime, closingDateTime) ? " [+1]" : ""}`;
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

type RadioOption = "open24" | "gesloten" | "onbekend" | "times";

const emptyRecord: Partial<UitzonderingOpeningstijden> = {
  openingDateTime: null,
  closingDateTime: null,
};

const setHourInDate = (date: moment.Moment, newHour: number): moment.Moment => {
  if (newHour < 0 || newHour >= 24) {
    throw new Error('Invalid hour value. Hour should be between 0 and 23.');
  }
  const newDate = date.clone();
  newDate.hours(newHour);
  return newDate;
};

const setMinutesInDate = (date: moment.Moment, newMinutes: number): moment.Moment => {
  if (newMinutes < 0 || newMinutes >= 60) {
    throw new Error('Invalid minutes value. Minutes should be between 0 and 59.');
  }
  const newDate = date.clone();
  newDate.minutes(newMinutes);
  return newDate;
};

const computeOptionFromForm = (form: Partial<UitzonderingOpeningstijden>): RadioOption => {
  const openVal = form.openingDateTime;
  const closeVal = form.closingDateTime;

  if (openVal === null || openVal === undefined || closeVal === null || closeVal === undefined) {
    return "gesloten";
  }

  const open = moment.utc(openVal);
  const close = moment.utc(closeVal);

  const isOpen24 = open.hours() === 0 && open.minutes() === 0 && close.hours() === 23 && close.minutes() === 59;
  const isGesloten = open.hours() === 0 && open.minutes() === 0 && close.hours() === 0 && close.minutes() === 0;

  if (isOpen24) return "open24";
  if (isGesloten) return "gesloten";
  return "times";
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
  const [radioSelection, setRadioSelection] = useState<RadioOption>("gesloten");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}?fietsenstallingID=${fietsenstallingID}`);
      const data = await res.json();
      // console.log('++++ data', data);
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
    // Set default to gesloten (00:00-00:00) for new records
    const today = moment.utc().startOf('day');
    const defaultForm = {
      openingDateTime: today.clone().hours(0).minutes(0).toDate(),
      closingDateTime: today.clone().hours(0).minutes(0).toDate(),
    };
    setForm(defaultForm);
    setRadioSelection("gesloten");
    setDialogMode('add');
    setShowDialog(true);
  };

  const openEditDialog = (record: UitzonderingOpeningstijden) => {
    setForm({ ...record });
    setRadioSelection(computeOptionFromForm(record));
    setEditRecord(record);
    setDialogMode('edit');
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditRecord(null);
    setForm(emptyRecord);
    setRadioSelection("gesloten");
  };

  const handleRadioChange = (option: RadioOption) => {
    setRadioSelection(option);
    const selectedDate = form.openingDateTime ? moment.utc(form.openingDateTime) : moment.utc();
    const dateOnly = selectedDate.startOf('day');

    let newopen: Date | null = null;
    let newdicht: Date | null = null;

    if (option === "open24") {
      newopen = dateOnly.clone().hours(0).minutes(0).toDate();
      newdicht = dateOnly.clone().hours(23).minutes(59).toDate();
    } else if (option === "gesloten") {
      newopen = dateOnly.clone().hours(0).minutes(0).toDate();
      newdicht = dateOnly.clone().hours(0).minutes(0).toDate();
    } else if (option === "times") {
      // If values are not set (null or special values), set defaults 10:00 - 17:00
      const currentOpen = form.openingDateTime ? moment.utc(form.openingDateTime) : null;
      const currentClose = form.closingDateTime ? moment.utc(form.closingDateTime) : null;
      const needDefaults = currentOpen === null || currentClose === null;
      if (needDefaults) {
        newopen = dateOnly.clone().hours(10).minutes(0).toDate();
        newdicht = dateOnly.clone().hours(17).minutes(0).toDate();
      } else {
        // keep whatever is there, but preserve the date
        newopen = dateOnly.clone().hours(currentOpen.hours()).minutes(currentOpen.minutes()).toDate();
        newdicht = dateOnly.clone().hours(currentClose.hours()).minutes(currentClose.minutes()).toDate();
      }
    }

    setForm({ ...form, openingDateTime: newopen, closingDateTime: newdicht });
  };

  const handleTimeChange = (isOpeningTime: boolean, isHoursField: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    const key = isOpeningTime ? 'openingDateTime' : 'closingDateTime';
    const currentTime = form[key] ? moment.utc(form[key]) : moment.utc();
    // Use the date from openingDateTime for both to keep them on the same date
    const baseDate = form.openingDateTime ? moment.utc(form.openingDateTime).startOf('day') : moment.utc().startOf('day');

    const newval = Number(e.target.value);
    let newtime: Date | null = null;

    if (isHoursField) {
      if (newval < 0 || newval > 23) {
        return; // invalid value
      }
      newtime = setHourInDate(baseDate.clone().hours(currentTime.hours()).minutes(currentTime.minutes()), newval).toDate();
    } else {
      if (newval < 0 || newval > 59) {
        return; // invalid value
      }
      newtime = setMinutesInDate(baseDate.clone().hours(currentTime.hours()).minutes(currentTime.minutes()), newval).toDate();
    }

    // When updating opening time, also update closing time's date to match
    if (isOpeningTime) {
      const closeTime = form.closingDateTime ? moment.utc(form.closingDateTime) : moment.utc();
      const closeOnSameDate = baseDate.clone().hours(closeTime.hours()).minutes(closeTime.minutes()).toDate();
      setForm({ ...form, [key]: newtime, closingDateTime: closeOnSameDate });
    } else {
      setForm({ ...form, [key]: newtime });
    }
  };

  const handleDialogSave = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Check for duplicate date (only for new records, or when editing if date changed)
    if (form.openingDateTime) {
      const selectedDate = moment.utc(form.openingDateTime).startOf('day');
      const existingRecord = records.find(r => {
        if (!r.openingDateTime) return false;
        const recordDate = moment.utc(r.openingDateTime).startOf('day');
        // For edit mode, exclude the current record being edited
        if (dialogMode === 'edit' && editRecord && r.ID === editRecord.ID) {
          return false;
        }
        return recordDate.isSame(selectedDate, 'day');
      });
      
      if (existingRecord) {
        setError("Voor deze dag is al een uitzondering ingesteld");
        return;
      }
    }
    
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
                  {formatTimeDisplay(r.openingDateTime, r.closingDateTime)}
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
                  {formatTimeDisplay(r.openingDateTime, r.closingDateTime)}
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
      {showDialog && (() => {
        const opentime = form.openingDateTime ? moment.utc(form.openingDateTime) : moment.utc().hours(10).minutes(0);
        const hoursopen = opentime.hours();
        const minutesopen = opentime.minutes();

        const closetime = form.closingDateTime ? moment.utc(form.closingDateTime) : moment.utc().hours(17).minutes(0);
        const hoursclose = closetime.hours();
        const minutesclose = closetime.minutes();

        const specifytimes = radioSelection === "times";

        return (
          <Modal onClose={closeDialog} title={dialogMode === 'add' ? 'Uitzondering toevoegen' : 'Uitzondering bewerken'}>
            <form onSubmit={handleDialogSave}>
              {error && <div style={{ color: "red", marginBottom: "1rem" }}>{error}</div>}
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
                  const newForm = { ...form, openingDateTime: open.toDate(), closingDateTime: close.toDate() };
                  setForm(newForm);
                  // Update radio selection based on new times
                  setRadioSelection(computeOptionFromForm(newForm));
                  // Clear error when date changes
                  setError(null);
                }}
                required
              />
              <div className="flex flex-col mt-4">
                <FormRadio 
                  name="radio-uitzondering"
                  value="open24"
                  checked={radioSelection === "open24"}
                  onChange={() => handleRadioChange("open24")}
                >
                  Gehele dag geopend
                </FormRadio>
                <FormRadio 
                  name="radio-uitzondering"
                  value="gesloten"
                  checked={radioSelection === "gesloten"}
                  onChange={() => handleRadioChange("gesloten")}
                >
                  Gehele dag gesloten
                </FormRadio>
                <FormRadio 
                  name="radio-uitzondering"
                  value="times"
                  checked={radioSelection === "times"}
                  onChange={() => handleRadioChange("times")}
                  classes="mb-0 flex flex-row items-center"
                >
                  Van
                  <FormInput
                    type="number"
                    value={hoursopen}
                    style={{ width: '80px', borderRadius: '10px 0 0 10px', textAlign: 'right' }}
                    onChange={handleTimeChange(true, true)}
                    disabled={!specifytimes}
                  />
                  <FormInput
                    type="number"
                    value={minutesopen}
                    style={{ width: '80px', borderRadius: '0 10px 10px 0' }}
                    onChange={handleTimeChange(true, false)}
                    disabled={!specifytimes}
                  />
                  <span className="mx-2">t/m</span>
                  <FormInput
                    type="number"
                    value={hoursclose}
                    size={4}
                    style={{ width: '80px', borderRadius: '10px 0 0 10px', textAlign: 'right' }}
                    onChange={handleTimeChange(false, true)}
                    disabled={!specifytimes}
                  />
                  <FormInput
                    type="number"
                    value={minutesclose}
                    size={4}
                    style={{ width: '80px', borderRadius: '0 10px 10px 0' }}
                    onChange={handleTimeChange(false, false)}
                    disabled={!specifytimes}
                  />
                </FormRadio>
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
                  Terug
                </button>
              </div>
            </form>
          </Modal>
        );
      })()}
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