import React from "react";
import moment from "moment";

import type { DayPrefix } from "~/types/index";
import type { ParkingDetailsType, UitzonderingenOpeningstijden } from "~/types/parking";

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

export type openingTodayType = {
  isOpen: boolean | undefined,
  message: string
}

// Get manually added exceptions
const getTodaysCustomOpeningTimes = (today: moment.Moment, uitzonderingenopeningstijden: UitzonderingenOpeningstijden) => {
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
  const daytxt = ["zo", "ma", "di", "wo", "do", "vr", "za"][dayidx] as DayPrefix;

  // Get manually added exceptions (uitzonderingenopeningstijden)
  const [customOpenTime, customCloseTime] = getTodaysCustomOpeningTimes(thedate, parkingdata.uitzonderingenopeningstijden);

  // Check if thedate is today
  const isToday = thedate.isSame(moment(), 'day');

  const opentime = (isToday && customOpenTime) || parkingdata[getOpenTimeKey(daytxt)];
  const closetime = (isToday && customCloseTime) || parkingdata[getDichtTimeKey(daytxt)];

  const openinfo = moment.utc(opentime);
  const closeinfo = moment.utc(closetime);

  const isNS = parkingdata.EditorCreated === "NS-connector";

  // handle exceptions
  let result = undefined;
  if (getExceptionTypes().includes(parkingdata.Type)) {
    result = { isOpen: undefined, message: "" }; // no opening times
  } else if (null === opentime || null === closetime) {
    result = { isOpen: undefined, message: "" }; // undefined
  } else {
    if (openinfo.hours() === 0 && openinfo.minutes() === 0 && closeinfo.hours() === 23 && closeinfo.minutes() === 59) {
      result = { isOpen: true, message: '24 uur open' }
    }
    else if (openinfo.hours() === 0 && openinfo.minutes() === 0 && closeinfo.hours() === 0 && closeinfo.minutes() === 0) {        // Exception for NS parkings: If NS parking AND open from 1am to 1am,
      // then the parking is open 24 hours per day.
      if (isNS) {
        result = { isOpen: true, message: '24 uur open' }
      } else {
        result = { isOpen: false, message: 'gesloten' }
      }
    }
  }

  if (undefined !== result) {
    return result
  }

  const currentMinutes = thedate.hours() * 60 + thedate.minutes();
  const openingMinutes = openinfo.hours() * 60 + openinfo.minutes();
  let closingMinutes = closeinfo.hours() * 60 + closeinfo.minutes();
  if (closingMinutes < openingMinutes) {
    // Closing time is on the next day, add 24 hours to closing time
    closingMinutes += 24 * 60;
  }

  let isOpen = currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
  if (openinfo.hours() === closingMinutes && openingMinutes === 60 && closingMinutes === 60) {
    isOpen = isNS;
  }
  else if (openinfo.hours() === 0 && openinfo.minutes() === 0 && closeinfo.hours() === 23 && closeinfo.minutes() === 59) {
    isOpen = true;
  }

  if (isOpen) {
    let str = `open`;

    // Exception: If this is a 24/h a day
    // NS parking -> don't show "until ..."
    if (opentime !== closetime) { // ||(openinfo==="00:00" && closeinfo==="23:59")
      str += `, sluit om ${formatTime(closeinfo)}`;
    }

    result = { isOpen: true, message: str };
  } else {
    result = { isOpen: false, message: "gesloten" };
  }

  if (result.isOpen === false) {
    // Extra check: see if the current time is part of yesterdays opening times
    const yesterdayidx = thedate.day() === 0 ? 6 : thedate.day() - 1;
    const yesterdaytxt = ["zo", "ma", "di", "wo", "do", "vr", "za"][yesterdayidx] as DayPrefix;

    const y_opentime = parkingdata[getOpenTimeKey(yesterdaytxt)]
    const y_closetime = parkingdata[getDichtTimeKey(yesterdaytxt)]

    if (null !== y_opentime && null !== y_closetime) {
      const y_openinfo = moment.utc(y_opentime);
      const y_closeinfo = moment.utc(y_closetime);

      const y_openingMinutes = y_openinfo.hours() * 60 + y_openinfo.minutes();
      const y_closingMinutes = y_closeinfo.hours() * 60 + y_closeinfo.minutes();

      // const exception = 
      //     y_openingMinutes === 0 && y_closingMinutes === 0 ||
      //     y_openingMinutes === 0 && y_closingMinutes === 60*23 + 59
      // never applies when condition below is true

      if (y_closingMinutes < y_openingMinutes && // closing time wraps to today
        currentMinutes >= 0 &&
        currentMinutes < y_closingMinutes) {
        // open when current time is between 0:00 and yesterdays closing time
        result.isOpen = true;
        result.message = "open";
        // Exception: If this is a 24/h a day
        // NS parking -> don't show "until ..."
        if (opentime !== closetime) {
          result.message += `, sluit om ${formatTime(y_closeinfo)}`;
        }
      }
    }
  }

  return result;
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
  isNS: boolean = false
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

  const [customOpenTime, customCloseTime] = getTodaysCustomOpeningTimes(weekdayDate, parkingdata.uitzonderingenopeningstijden);
  const isCustomOpenTime = customOpenTime !== null || customCloseTime !== null;

  const opentime = (customOpenTime) || parkingdata[getOpenTimeKey(day)];
  const closetime = (customCloseTime) || parkingdata[getDichtTimeKey(day)];
  const tmpopen = moment.utc(opentime);
  const hoursopen = tmpopen.hours();
  const minutesopen = String(tmpopen.minutes()).padStart(2, "0");

  const tmpclose = moment.utc(closetime);
  const hoursclose = tmpclose.hours();
  const minutesclose = String(tmpclose.minutes()).padStart(2, "0");

  let value = `${hoursopen}:${minutesopen} - ${hoursclose}:${minutesclose}`;

  if (getExceptionTypes().includes(parkingdata.Type)) {
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

