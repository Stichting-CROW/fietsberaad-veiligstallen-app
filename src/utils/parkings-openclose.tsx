import React from "react";
import moment from "moment";

import type { DayPrefix } from "~/types/index";
import type { ParkingDetailsType, UitzonderingenOpeningstijden } from "~/types/parking";
import {
  isOpenNow,
  formatTimeHHmm,
  type OpeningHoursSchedule,
} from "~/utils/opening-hours";

const getOpenTimeKey = (day: DayPrefix): keyof ParkingDetailsType => {
  return ('Open_' + day) as keyof ParkingDetailsType;
}

const getDichtTimeKey = (day: DayPrefix): keyof ParkingDetailsType => {
  return ('Dicht_' + day) as keyof ParkingDetailsType;
}

export const formatTime = (time: moment.Moment): string => {
  return time.format('HH:mm');
};

const getExceptionTypes = () => {
  return [
    "fietstrommel",
    "fietskluizen",
    "buurtstalling"
  ]
}

const DAYS: DayPrefix[] = ["zo", "ma", "di", "wo", "do", "vr", "za"];

function buildSchedule(
  parkingdata: ParkingDetailsType,
  daytxt: DayPrefix,
  customOpenTime: string | Date | null | undefined,
  customCloseTime: string | Date | null | undefined
): OpeningHoursSchedule {
  const schedule: OpeningHoursSchedule = {};
  for (const d of DAYS) {
    if (d === daytxt && (customOpenTime != null || customCloseTime != null)) {
      schedule[`Open_${d}`] = customOpenTime ?? null;
      schedule[`Dicht_${d}`] = customCloseTime ?? null;
    } else {
      const openVal = parkingdata[getOpenTimeKey(d)];
      const dichtVal = parkingdata[getDichtTimeKey(d)];
      schedule[`Open_${d}`] = openVal ?? null;
      schedule[`Dicht_${d}`] = dichtVal ?? null;
    }
  }
  return schedule;
}

export type openingTodayType = {
  isOpen: boolean | undefined,
  message: string
}

// Get manually added exceptions
const getTodaysCustomOpeningTimes = (today: moment.Moment, uitzonderingenopeningstijden: UitzonderingenOpeningstijden | null) => {
  if (!uitzonderingenopeningstijden) {
    return [null, null];
  }

  const customOpeningTimes = uitzonderingenopeningstijden.find(x => {
    return today.isSame(moment(x.openingDateTime), 'day');
  });
  
  if (!customOpeningTimes) {
    return [null, null];
  }

  const customOpenTime = customOpeningTimes.openingDateTime;
  const customCloseTime = customOpeningTimes.closingDateTime;

  return [customOpenTime, customCloseTime];
}

export const formatOpeningToday = (parkingdata: ParkingDetailsType, thedate: moment.Moment): openingTodayType => {
  const dayidx = thedate.day();
  const daytxt = DAYS[dayidx] as DayPrefix;

  // Get manually added exceptions (uitzonderingenopeningstijden)
  const [customOpenTime, customCloseTime] = getTodaysCustomOpeningTimes(thedate, parkingdata.uitzonderingenopeningstijden);

  const opentime = (customOpenTime != null
    ? customOpenTime
    : (daytxt ? parkingdata[getOpenTimeKey(daytxt)] : null));
  const closetime = (customCloseTime != null
    ? customCloseTime
    : (daytxt ? parkingdata[getDichtTimeKey(daytxt)] : null));

  const openinfo = typeof opentime === 'string' ? moment.utc(opentime) : moment.invalid();
  const closeinfo = typeof closetime === 'string' ? moment.utc(closetime) : moment.invalid();

  const isNS = parkingdata.EditorCreated === "NS-connector";

  // handle exceptions
  if (getExceptionTypes().includes((parkingdata.Type||""))) {
    return { isOpen: undefined, message: "" }; // no opening times
  }
  if (null === opentime || null === closetime) {
    return { isOpen: undefined, message: "" }; // undefined
  }
  if (openinfo.hours() === 0 && openinfo.minutes() === 0 && closeinfo.hours() === 23 && closeinfo.minutes() === 59) {
    return { isOpen: true, message: '24 uur open' };
  }
  if (openinfo.hours() === 0 && openinfo.minutes() === 0 && closeinfo.hours() === 0 && closeinfo.minutes() === 0) {
    // Exception for NS parkings: If NS parking AND open from 1am to 1am, then the parking is open 24 hours per day.
    return isNS ? { isOpen: true, message: '24 uur open' } : { isOpen: false, message: 'gesloten' };
  }

  // Use shared opening-hours logic (handles overnight spans, yesterday's span in early morning)
  const schedule = buildSchedule(parkingdata, daytxt, customOpenTime, customCloseTime);
  const { isOpen, closeTimeForDisplay } = isOpenNow(schedule, thedate.toDate(), {
    withCloseTime: true,
    unknownAsOpen: false,
  });

  if (isOpen) {
    const str = closeTimeForDisplay && opentime !== closetime
      ? `open, sluit om ${formatTimeHHmm(closeTimeForDisplay)}`
      : "open";
    return { isOpen: true, message: str };
  }
  return { isOpen: false, message: "gesloten" };
};

export const hasCustomOpeningTimesComingWeek = (parkingdata: ParkingDetailsType): boolean => {
  // Get custom opening times for today and the next 6 days
  for (let i = 0; i < 7; i++) {
    const day = moment().add(i, 'days');
    const [customOpenTime, customCloseTime] = getTodaysCustomOpeningTimes(day, parkingdata.uitzonderingenopeningstijden);
    if (customOpenTime !== null || customCloseTime !== null) {
      return true;
    }
  }
  return false;
}

export const formatOpeningTimes = (
  parkingdata: ParkingDetailsType,
  day: DayPrefix,
  label: string,
  isToday: boolean,
  isNS = false
): React.ReactNode => {
  // Get date based on current week and given day
  // Day is a string like 'ma', 'di', 'wo', 'do', 'vr', 'za', 'zo', Dutch for 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
  const dayToNumber: Record<DayPrefix, number> = {
    'ma': 1,  // Monday
    'di': 2,  // Tuesday
    'wo': 3,  // Wednesday
    'do': 4,  // Thursday
    'vr': 5,  // Friday
    'za': 6,  // Saturday
    'zo': 7   // Sunday
  };

  // for weekdays before today, add 7 days to get to the next week
  const todayIsoWeekday = moment().isoWeekday();
  const weekdayDate = moment().isoWeekday(dayToNumber[day] + (todayIsoWeekday > dayToNumber[day] ? 7 : 0));

  const [customOpenTime, customCloseTime] = getTodaysCustomOpeningTimes(weekdayDate, parkingdata.uitzonderingenopeningstijden ?? []);
  const isCustomOpenTime = customOpenTime != null || customCloseTime != null;

  const opentime = (customOpenTime != null
    ? customOpenTime
    : (day && day !== null && day !== undefined
        ? parkingdata[getOpenTimeKey(day as DayPrefix)]
        : null));
  const closetime = (customCloseTime != null
    ? customCloseTime
    : (day && day !== null && day !== undefined
        ? parkingdata[getDichtTimeKey(day as DayPrefix)]
        : null));
  const tmpopen = typeof opentime === 'string' ? moment.utc(opentime) : moment.invalid();
  const hoursopen = tmpopen.hours();
  const minutesopen = String(tmpopen.minutes()).padStart(2, "0");

  const tmpclose = typeof closetime === 'string' ? moment.utc(closetime) : moment.invalid();
  const hoursclose = tmpclose.hours();
  const minutesclose = String(tmpclose.minutes()).padStart(2, "0");

  let value = `${hoursopen}:${minutesopen} - ${hoursclose}:${minutesclose}`;

  if (getExceptionTypes().includes(parkingdata.Type||"")) {
    return null; // no opening times
  } else if (null === opentime || null === closetime) {
    value = "Onbekend"; // onbekend
  }
  else if (hoursopen === 0 && minutesopen === "00" && hoursclose === 23 && minutesclose === "59") {
    value = '24h'
  }
  else if (hoursopen === 0 && minutesopen === "00" && hoursclose === 0 && minutesclose === "00") {        // Exception for NS parkings: If NS parking AND open from 1am to 1am,
    // then the parking is open 24 hours per day.
    if (isNS) {
      value = '24h';
    } else {
      value = 'gesloten';
    }
  }

  return (
    <>
      <div className={isToday ? "font-bold" : ""}>{label}{isCustomOpenTime ? " *" : ""}</div>
      <div className="text-right">{value}</div>
    </>
  );
};

