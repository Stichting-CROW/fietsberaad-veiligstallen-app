import React, { useState, useEffect } from "react";
import type { DayPrefix } from "~/types/index";
import type { ParkingDetailsType } from "~/types/parking";

import SectionBlock from "~/components/SectionBlock";
import HorizontalDivider from "~/components/HorizontalDivider";
import FormInput from "~/components/Form/FormInput";
import FormCheckbox from "~/components/Form/FormCheckbox";
import FormRadio from "~/components/Form/FormRadio";
import RichTextEditor from "~/components/common/RichTextEditor";
import ParkingOpeningUitzonderingen from "~/components/parking/ParkingOpeningUitzonderingen";

import moment from "moment";

type OpeningDetailsType = {
  Open_ma: Date | null,
  Dicht_ma: Date | null,
  Open_di: Date | null,
  Dicht_di: Date | null,
  Open_wo: Date | null,
  Dicht_wo: Date | null,
  Open_do: Date | null,
  Dicht_do: Date | null,
  Open_vr: Date | null,
  Dicht_vr: Date | null,
  Open_za: Date | null,
  Dicht_za: Date | null,
  Open_zo: Date | null,
  Dicht_zo: Date | null,
}

export type OpeningChangedType = {
  [key: string]: moment.Moment | null
}

const getOpenTimeKey = (day: DayPrefix): keyof OpeningDetailsType => {
  return ('Open_' + day) as keyof OpeningDetailsType;
}

const getDichtTimeKey = (day: DayPrefix): keyof OpeningDetailsType => {
  return ('Dicht_' + day) as keyof OpeningDetailsType;
}

type RadioOption = "open24" | "gesloten" | "onbekend" | "times";

const formatOpeningTimesForEdit = (
  parkingdata: OpeningDetailsType,
  isNS: boolean,
  day: DayPrefix,
  label: string,
  handlerChange: Function,
  handlerChangeChecks: Function,
  canEditAllFields: boolean,
  canEditLimitedFields: boolean,
  selectedOption: RadioOption,
): React.ReactNode => {
  const opentime = parkingdata[getOpenTimeKey(day)];
  const tmpopen = moment.utc(opentime);
  const hoursopen = tmpopen.hours();
  const minutesopen = String(tmpopen.minutes()).padStart(2, "0");

  const closetime = parkingdata[getDichtTimeKey(day)];
  const tmpclose = moment.utc(closetime);
  const hoursclose = tmpclose.hours();
  const minutesclose = String(tmpclose.minutes()).padStart(2, "0");

  const specifytimes = selectedOption === "times";
  

  return (
    <tr>
      <td className="align-top">{label}</td>
      <td className="align-top">
        <div className="flex flex-col">
          <FormRadio 
            name={`radio-${day}`}
            value="open24"
            checked={selectedOption === "open24"}
            onChange={(e) => handlerChangeChecks(day, "open24")}
            disabled={!canEditAllFields && !canEditLimitedFields}
          >
            Gehele dag geopend
          </FormRadio>
          {!isNS && (
            <FormRadio 
              name={`radio-${day}`}
              value="gesloten"
              checked={selectedOption === "gesloten"}
              onChange={(e) => handlerChangeChecks(day, "gesloten")}
              disabled={!canEditAllFields && !canEditLimitedFields}
            >
              Gehele dag gesloten
            </FormRadio>
          )}
          <FormRadio 
            name={`radio-${day}`}
            value="onbekend"
            checked={selectedOption === "onbekend"}
            onChange={(e) => handlerChangeChecks(day, "onbekend")}
            disabled={!canEditAllFields && !canEditLimitedFields}
          >
            Onbekend
          </FormRadio>
          <FormRadio 
            name={`radio-${day}`}
            value="times"
            checked={selectedOption === "times"}
            onChange={(e) => handlerChangeChecks(day, "times")}
            disabled={!canEditAllFields && !canEditLimitedFields}
            classes="mb-0 flex flex-row items-center"
          >
              Van
              <FormInput
                type="number"
                value={hoursopen}
                style={{ width: '80px', borderRadius: '10px 0 0 10px', textAlign: 'right' }}
                onChange={handlerChange(day, true, true)}
                disabled={!canEditAllFields && !canEditLimitedFields || !specifytimes}
              />
              <FormInput
                type="number"
                value={minutesopen}
                style={{ width: '80px', borderRadius: '0 10px 10px 0' }}
                onChange={handlerChange(day, true, false)}
                disabled={!canEditAllFields && !canEditLimitedFields || !specifytimes}
              />
            <span className="mx-2">t/m</span>
              <FormInput
                type="number"
                value={hoursclose}
                size={4}
                style={{ width: '80px', borderRadius: '10px 0 0 10px', textAlign: 'right' }}
                onChange={handlerChange(day, false, true)}
                disabled={!canEditAllFields && !canEditLimitedFields || !specifytimes}
              />
              <FormInput
                type="number"
                value={minutesclose}
                size={4}
                style={{ width: '80px', borderRadius: '0 10px 10px 0' }}
                onChange={handlerChange(day, false, false)}
                disabled={!canEditAllFields && !canEditLimitedFields || !specifytimes}
              />
          </FormRadio>
        </div>
      </td>
    </tr>
  );
};

const extractParkingFields = (parkingdata: ParkingDetailsType): OpeningDetailsType => {
  return {
    Open_ma: parkingdata.Open_ma,
    Dicht_ma: parkingdata.Dicht_ma,
    Open_di: parkingdata.Open_di,
    Dicht_di: parkingdata.Dicht_di,
    Open_wo: parkingdata.Open_wo,
    Dicht_wo: parkingdata.Dicht_wo,
    Open_do: parkingdata.Open_do,
    Dicht_do: parkingdata.Dicht_do,
    Open_vr: parkingdata.Open_vr,
    Dicht_vr: parkingdata.Dicht_vr,
    Open_za: parkingdata.Open_za,
    Dicht_za: parkingdata.Dicht_za,
    Open_zo: parkingdata.Open_zo,
    Dicht_zo: parkingdata.Dicht_zo,
  }
}

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

const ParkingEditOpening = ({ 
  parkingdata, 
  openingChanged, 
  canEditAllFields = true, 
  canEditLimitedFields = true,
  isVoorstel = false
}: { 
  parkingdata: ParkingDetailsType, 
  openingChanged: Function,
  canEditAllFields?: boolean,
  canEditLimitedFields?: boolean,
  isVoorstel?: boolean
}) => {
  const startValues = extractParkingFields(parkingdata);
  const isNS = parkingdata.EditorCreated === "NS-connector";
  const [changes, setChanges] = useState<OpeningChangedType>({});
  const [openingstijden, setOpeningstijden] = useState<string | undefined>(undefined);
  const computeOptionForDay = (day: DayPrefix): RadioOption => {
    const openKey = getOpenTimeKey(day);
    const closeKey = getDichtTimeKey(day);
    const openVal = startValues[openKey];
    const closeVal = startValues[closeKey];

    if (openVal === null && closeVal === null) return "onbekend";

    const open = moment.utc(openVal);
    const close = moment.utc(closeVal);

    if (!isNS) {
      const isOpen24 = open.hours() === 0 && open.minutes() === 0 && close.hours() === 23 && close.minutes() === 59;
      const isGesloten = open.hours() === 0 && open.minutes() === 0 && close.hours() === 0 && close.minutes() === 0;
      if (isOpen24) return "open24";
      if (isGesloten) return "gesloten";
    } else {
      // NS connector: open24 when both 00:00, no separate 'gesloten'
      const isOpen24NS = open.hours() === 0 && open.minutes() === 0 && close.hours() === 0 && close.minutes() === 0;
      if (isOpen24NS) return "open24";
    }
    return "times";
  };

  const [radioSelection, setRadioSelection] = useState<Record<DayPrefix, RadioOption>>(() => ({
    ma: computeOptionForDay("ma"),
    di: computeOptionForDay("di"),
    wo: computeOptionForDay("wo"),
    do: computeOptionForDay("do"),
    vr: computeOptionForDay("vr"),
    za: computeOptionForDay("za"),
    zo: computeOptionForDay("zo"),
  }));

  useEffect(() => {
    if (Object.keys(changes).length > 0) {
      openingChanged(changes, openingstijden);
    } else {
      openingChanged(undefined, openingstijden);
    }
  }, [changes, openingstijden]);

  // Function that runs if the opening time changes
  const handleChange = (day: DayPrefix, isOpeningTime: boolean, isHoursField: boolean) => (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();

    const key = isOpeningTime ? getOpenTimeKey(day) : getDichtTimeKey(day);
    // determine new time

    // let oldtime: Date = new Date((key in currentValues) ? currentValues[key]: startValues[key]);
    const oldtime = moment.utc((key in changes) ? changes[key] : startValues[key]);
    let newtime = undefined;

    const newval = Number(e.target.value);
    if (isHoursField) {
      if (newval < 0 || newval > 23) {
        return; // invalid value
      }

      newtime = setHourInDate(oldtime, newval);
    } else {
      if (newval < 0 || newval > 59) {
        return; // invalid value
      }

      newtime = setMinutesInDate(oldtime, newval);
    }

    // setCurrentValues({...currentValues, [key]: newtime.toString()});
    setChanges({ ...changes, [key]: newtime });
  }

  // Function that runs if the active state changes
  const handleChangeChecks = (day: DayPrefix, whichcheck: "open24" | "gesloten" | "onbekend") => (e: React.ChangeEvent<HTMLInputElement>) => {
    const openkey = getOpenTimeKey(day)
    const dichtkey = getDichtTimeKey(day);

    let newopen: moment.Moment | null = null;
    let newdicht: moment.Moment | null = null;

    if (e.target.checked) {
      switch (whichcheck) {
        case "open24":
          if (!isNS) {
            newopen = moment.utc(0);
            newdicht = setMinutesInDate(setHourInDate(moment.utc(0), 23), 59);
          } else {
            newopen = moment.utc(0);
            newdicht = moment.utc(0);
          }
          break;
        case "gesloten":
          newopen = moment.utc(0);
          newdicht = moment.utc(0);
          break;
        case "onbekend":
          newopen = null;
          newdicht = null;
          break;
      }
    } else {
      newopen = setHourInDate(moment.utc(0), 10);
      newdicht = setHourInDate(moment.utc(0), 17);
    }
    setChanges({ ...changes, [openkey]: newopen, [dichtkey]: newdicht });
  }

  // Radio change handler per day
  const handleChangeRadio = (day: DayPrefix, option: RadioOption) => {
    const openkey = getOpenTimeKey(day);
    const dichtkey = getDichtTimeKey(day);

    let newopen: moment.Moment | null = null;
    let newdicht: moment.Moment | null = null;

    if (option === "open24") {
      if (!isNS) {
        newopen = moment.utc(0);
        newdicht = setMinutesInDate(setHourInDate(moment.utc(0), 23), 59);
      } else {
        newopen = moment.utc(0);
        newdicht = moment.utc(0);
      }
    } else if (option === "gesloten") {
      newopen = moment.utc(0);
      newdicht = moment.utc(0);
    } else if (option === "onbekend") {
      newopen = null;
      newdicht = null;
    } else if (option === "times") {
      // If values are not set (null or special values), set defaults 10:00 - 17:00
      const currentOpen = (openkey in changes) ? changes[openkey] : startValues[openkey];
      const currentClose = (dichtkey in changes) ? changes[dichtkey] : startValues[dichtkey];
      const needDefaults = currentOpen === null || currentClose === null;
      if (needDefaults) {
        newopen = setHourInDate(moment.utc(0), 10);
        newdicht = setHourInDate(moment.utc(0), 17);
      } else {
        // keep whatever is there
        newopen = moment.utc(currentOpen as any);
        newdicht = moment.utc(currentClose as any);
      }
    }

    setRadioSelection({ ...radioSelection, [day]: option });
    if (!(newopen === null && newdicht === null && option === "times")) {
      setChanges({ ...changes, [openkey]: newopen, [dichtkey]: newdicht });
    }
  };

  const setAllDays = (option: RadioOption) => {
    const days: DayPrefix[] = ["ma","di","wo","do","vr","za","zo"];
    const newSel = { ...radioSelection } as Record<DayPrefix, RadioOption>;
    const newChanges: OpeningChangedType = { ...changes };
    days.forEach((d) => {
      newSel[d] = option;
      const openkey = getOpenTimeKey(d);
      const dichtkey = getDichtTimeKey(d);
      if (option === "open24") {
        if (!isNS) {
          newChanges[openkey] = moment.utc(0);
          newChanges[dichtkey] = setMinutesInDate(setHourInDate(moment.utc(0), 23), 59);
        } else {
          newChanges[openkey] = moment.utc(0);
          newChanges[dichtkey] = moment.utc(0);
        }
      } else if (option === "onbekend") {
        newChanges[openkey] = null;
        newChanges[dichtkey] = null;
      } else if (option === "gesloten") {
        newChanges[openkey] = moment.utc(0);
        newChanges[dichtkey] = moment.utc(0);
      }
      if (option === "times") {
        newChanges[openkey] = setHourInDate(moment.utc(0), 10);
        newChanges[dichtkey] = setHourInDate(moment.utc(0), 17);
      }
    });
    setRadioSelection(newSel);
    setChanges(newChanges);
  };

  // Function that runs if extra description field changes
  const handleChangeOpeningstijden = (value: string) => {
    if (value === parkingdata.Openingstijden) {
      setOpeningstijden(undefined);
    } else {
      setOpeningstijden(value);
    }
  }

  const data = Object.assign(
    { ...startValues },
    { ...changes }
  );

  const allUnknown = ["ma","di","wo","do","vr","za","zo"].every((d) => radioSelection[d as DayPrefix] === "onbekend");

  return (
    <>
      <div className="flex flex-col">
        <SectionBlock
          heading="Openingstijden"
        >
          {/* <p className="py-2 text-red">
            Het veranderen van de openingstijden (specifiek uren) werkt tijdelijk niet. We werken hieraan; kom binnenkort terug als je de uren wilt aanpassen.
          </p> */}
          <div className="mb-2">
            <button
              onClick={() => setAllDays("open24")}
              className="bg-gray-200 text-gray-800 rounded px-3 py-1 hover:bg-gray-300 transition text-sm"
            >
              Altijd geopend
            </button>
            <button
              onClick={() => setAllDays("onbekend")}
              className="bg-gray-200 text-gray-800 rounded px-3 py-1 hover:bg-gray-300 transition text-sm ml-2"
            >
              Onbekend
            </button>
          </div>
          <table className="w-full">
            <tbody>
              {formatOpeningTimesForEdit(data, isNS, "ma", "Maandag", handleChange, handleChangeRadio, canEditAllFields, canEditLimitedFields, radioSelection.ma)}
              {formatOpeningTimesForEdit(data, isNS, "di", "Dinsdag", handleChange, handleChangeRadio, canEditAllFields, canEditLimitedFields, radioSelection.di)}
              {formatOpeningTimesForEdit(data, isNS, "wo", "Woensdag", handleChange, handleChangeRadio, canEditAllFields, canEditLimitedFields, radioSelection.wo)}
              {formatOpeningTimesForEdit(data, isNS, "do", "Donderdag", handleChange, handleChangeRadio, canEditAllFields, canEditLimitedFields, radioSelection.do)}
              {formatOpeningTimesForEdit(data, isNS, "vr", "Vrijdag", handleChange, handleChangeRadio, canEditAllFields, canEditLimitedFields, radioSelection.vr)}
              {formatOpeningTimesForEdit(data, isNS, "za", "Zaterdag", handleChange, handleChangeRadio, canEditAllFields, canEditLimitedFields, radioSelection.za)}
              {formatOpeningTimesForEdit(data, isNS, "zo", "Zondag", handleChange, handleChangeRadio, canEditAllFields, canEditLimitedFields, radioSelection.zo)}
            </tbody>
          </table>
        </SectionBlock>
        {!isVoorstel && <HorizontalDivider className="my-4" /> }
        {!isVoorstel && <ParkingOpeningUitzonderingen fietsenstallingID={parkingdata.ID} editMode={true} /> } 
        {!isVoorstel && <HorizontalDivider className="my-4" /> }
        {!isVoorstel && <SectionBlock
          heading="Tekst Afwijkende Openingstijden"
          contentClasses="w-full">
          <RichTextEditor
            value={undefined === openingstijden ? (parkingdata.Openingstijden || '') : openingstijden}
            onChange={handleChangeOpeningstijden}
            className="w-full"
          />
        </SectionBlock> }
      </div>
    </>
  );
};

export default ParkingEditOpening;
