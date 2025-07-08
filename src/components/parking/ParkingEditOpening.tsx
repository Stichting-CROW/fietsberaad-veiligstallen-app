import React, { useState, useEffect } from "react";
import type { DayPrefix } from "~/types/index";
import type { ParkingDetailsType } from "~/types/parking";

import SectionBlock from "~/components/SectionBlock";
import HorizontalDivider from "~/components/HorizontalDivider";
import FormInput from "~/components/Form/FormInput";
import FormTextArea from "~/components/Form/FormTextArea";
import FormCheckbox from "~/components/Form/FormCheckbox";
import ParkingOpeningUitzonderingen from "~/components/parking/ParkingOpeningUitzonderingen";

import moment from "moment";

type OpeningDetailsType = {
  Open_ma: Date,
  Dicht_ma: Date,
  Open_di: Date,
  Dicht_di: Date,
  Open_wo: Date,
  Dicht_wo: Date,
  Open_do: Date,
  Dicht_do: Date,
  Open_vr: Date,
  Dicht_vr: Date,
  Open_za: Date,
  Dicht_za: Date,
  Open_zo: Date,
  Dicht_zo: Date,
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

const formatOpeningTimesForEdit = (
  parkingdata: OpeningDetailsType,
  isNS: boolean,
  day: DayPrefix,
  label: string,
  handlerChange: Function,
  handlerChangeChecks: Function,
): React.ReactNode => {
  const wkday = new Date().getDay();

  const opentime = parkingdata[getOpenTimeKey(day)];
  const tmpopen = moment.utc(opentime);
  const hoursopen = tmpopen.hours();
  const minutesopen = String(tmpopen.minutes()).padStart(2, "0");

  const closetime = parkingdata[getDichtTimeKey(day)];
  const tmpclose = moment.utc(closetime);
  const hoursclose = tmpclose.hours();
  const minutesclose = String(tmpclose.minutes()).padStart(2, "0");

  let onbekend = false;
  let gesloten = false;
  let open24h = false;

  if (isNS) {
    onbekend = opentime === null && closetime === null;
    open24h = tmpopen.hours() === 0 && tmpopen.minutes() === 0 && tmpopen.hours() === 0 && tmpopen.minutes() === 0;
    gesloten = false;
  } else {
    onbekend = opentime === null && closetime === null;
    open24h = !onbekend && (tmpopen.hours() === 0 && tmpopen.minutes() === 0 && tmpclose.hours() === 23 && tmpclose.minutes() === 59);
    gesloten = !onbekend && (tmpopen.hours() === 0 && tmpopen.minutes() === 0 && tmpclose.hours() === 0 && tmpclose.minutes() === 0);
  }

  const showtimes = !(open24h || gesloten || onbekend);

  return (
    <tr className="h-14">
      <td>{label}</td>
      <td>
        <FormCheckbox key={"cb-" + day} checked={open24h} onChange={handlerChangeChecks(day, "open24")}>
          24h
        </FormCheckbox>
      </td>
      <td>
        {isNS === false && <FormCheckbox key={"cb-" + day} checked={gesloten} onChange={handlerChangeChecks(day, "gesloten")}>
          gesloten
        </FormCheckbox>}
      </td>
      <td>
        <FormCheckbox key={"cb-" + day} checked={onbekend} onChange={handlerChangeChecks(day, "onbekend")}>
          onbekend
        </FormCheckbox>
      </td>
      <td>
        {showtimes ?
          <div className="flex flex-row">
            <FormInput
              type="number"
              value={hoursopen}
              style={{ width: '80px', borderRadius: '10px 0 0 10px', textAlign: 'right' }}
              onChange={handlerChange(day, true, true)}
            />
            <FormInput
              type="number"
              value={minutesopen}
              style={{ width: '80px', borderRadius: '0 10px 10px 0' }}
              onChange={handlerChange(day, true, false)}
            />
          </div>
          :
          null}
      </td>
      <td>
        {showtimes ? 't/m' : ''}
      </td>
      <td>
        {showtimes ?
          <div className="flex flex-row">
            <FormInput
              type="number"
              value={hoursclose}
              size={4}
              style={{ width: '80px', borderRadius: '10px 0 0 10px', textAlign: 'right' }}
              onChange={handlerChange(day, false, true)}
            />
            <FormInput
              type="number"
              value={minutesclose}
              size={4}
              style={{ width: '80px', borderRadius: '0 10px 10px 0' }}
              onChange={handlerChange(day, false, false)}
            />
          </div>
          :
          null}
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

const ParkingEditOpening = ({ parkingdata, openingChanged }: { parkingdata: ParkingDetailsType, openingChanged: Function }) => {
  const startValues = extractParkingFields(parkingdata);
  const isNS = parkingdata.EditorCreated === "NS-connector";
  const [changes, setChanges] = useState<OpeningChangedType>({});
  const [openingstijden, setOpeningstijden] = useState<string | undefined>(undefined);

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

  // Function that runs if extra description field changes
  const handleChangeOpeningstijden = () => (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (e.target.value === parkingdata.Openingstijden) {
      setOpeningstijden(undefined);
    } else {
      setOpeningstijden(e.target.value);
    }
  }

  const data = Object.assign(
    { ...startValues },
    { ...changes }
  );

  return (
    <>
      <div className="flex flex-col">
        <SectionBlock
          heading="Openingstijden"
        >
          {/* <p className="py-2 text-red">
            Het veranderen van de openingstijden (specifiek uren) werkt tijdelijk niet. We werken hieraan; kom binnenkort terug als je de uren wilt aanpassen.
          </p> */}
          <table className="w-full">
            <tbody>
              {formatOpeningTimesForEdit(data, isNS, "ma", "Maandag", handleChange, handleChangeChecks)}
              {formatOpeningTimesForEdit(data, isNS, "di", "Dinsdag", handleChange, handleChangeChecks)}
              {formatOpeningTimesForEdit(data, isNS, "wo", "Woensdag", handleChange, handleChangeChecks)}
              {formatOpeningTimesForEdit(data, isNS, "do", "Donderdag", handleChange, handleChangeChecks)}
              {formatOpeningTimesForEdit(data, isNS, "vr", "Vrijdag", handleChange, handleChangeChecks)}
              {formatOpeningTimesForEdit(data, isNS, "za", "Zaterdag", handleChange, handleChangeChecks)}
              {formatOpeningTimesForEdit(data, isNS, "zo", "Zondag", handleChange, handleChangeChecks)}
            </tbody>
          </table>
        </SectionBlock>
        <HorizontalDivider className="my-4" />
        <ParkingOpeningUitzonderingen fietsenstallingID={parkingdata.ID} editMode={true} />
        <HorizontalDivider className="my-4" />
        <SectionBlock
          heading="Tekst Afwijkende Openingstijden"
          contentClasses="w-full">
          <FormTextArea
            value={undefined === openingstijden ? (parkingdata.Openingstijden !== null ? parkingdata.Openingstijden.replaceAll("<br />", "\n") : '') : openingstijden}
            style={{ width: '100%', borderRadius: '0 10px 10px 0' }}
            className="w-full"
            onChange={handleChangeOpeningstijden()}
            rows={10}
          />
        </SectionBlock>
      </div>
    </>
  );
};

export default ParkingEditOpening;
