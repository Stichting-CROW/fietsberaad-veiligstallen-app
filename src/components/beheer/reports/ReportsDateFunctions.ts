import moment, { utc } from "moment";
import { type ReportState } from "./ReportsFilter";

export const getWeekNumber = (date: Date): number => {
  const start = new Date(date.getFullYear(), 0, 1);
  const diff = date.getTime() - start.getTime();
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.ceil((diff / oneDay + start.getDay() + 1) / 7);
};

/**
 * Get the date from an ISO 8601 week and year
 * via: https://stackoverflow.com/a/16591175
 * 
 * https://en.wikipedia.org/wiki/ISO_week_date
 *
 * @param {number} week ISO 8601 week number
 * @param {number} year ISO year
 *
 * Examples:
 *  getDateOfIsoWeek(53, 1976) -> Mon Dec 27 1976
 *  getDateOfIsoWeek( 1, 1978) -> Mon Jan 02 1978
 *  getDateOfIsoWeek( 1, 1980) -> Mon Dec 31 1979
 *  getDateOfIsoWeek(53, 2020) -> Mon Dec 28 2020
 *  getDateOfIsoWeek( 1, 2021) -> Mon Jan 04 2021
 *  getDateOfIsoWeek( 0, 2023) -> Invalid (no week 0)
 *  getDateOfIsoWeek(53, 2023) -> Invalid (no week 53 in 2023)
 */
function getDateOfIsoWeek(year: number, week: number) {
  week = parseFloat(week);
  year = parseFloat(year);

  if (week < 1 || week > 53) {
    throw new RangeError("ISO 8601 weeks are numbered from 1 to 53");
  } else if (!Number.isInteger(week)) {
    throw new TypeError("Week must be an integer");
  } else if (!Number.isInteger(year)) {
    throw new TypeError("Year must be an integer");
  }

  const simple = new Date(year, 0, 1 + (week - 1) * 7);
  const dayOfWeek = simple.getDay();
  const isoWeekStart = simple;

  // Get the Monday past, and add a week if the day was
  // Friday, Saturday or Sunday.

  isoWeekStart.setDate(simple.getDate() - dayOfWeek + 1);
  if (dayOfWeek > 4) {
    isoWeekStart.setDate(isoWeekStart.getDate() + 7);
  }

  // The latest possible ISO week starts on December 28 of the current year.
  if (isoWeekStart.getFullYear() > year ||
    (isoWeekStart.getFullYear() == year &&
      isoWeekStart.getMonth() == 11 &&
      isoWeekStart.getDate() > 28)) {
    throw new RangeError(`${year} has no ISO week ${week}`);
  }

  return isoWeekStart;
}

// export const firstDayOfWeek = (year: number, weeknumber: number): Date => {
//   const janFirst = new Date(year, 0, 1);
//   const daysOffset = (weeknumber - 1) * 7;
//   const firstDay = new Date(janFirst.setDate(janFirst.getDate() + daysOffset));
//   const dayOfWeek = firstDay.getDay();
//   const diff = firstDay.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
//   return new Date(firstDay.setDate(diff));
// }

export const lastDayOfWeek = (year: number, weeknumber: number): Date => {
  const firstDay = getDateOfIsoWeek(year, weeknumber);
  return new Date(firstDay.setDate(firstDay.getDate() + 6));
}

export const getQuarter = (date: Date): number => {
  return Math.floor(date.getMonth() / 3) + 1;
};

export const getMaanden = (): Array<string> => {
  return Array.from({ length: 12 }, (_, i) => {
    const date = new Date(2024, i, 1);
    return date.toLocaleDateString('nl-NL', { month: 'long' });
  });
};

export const getSingleYearRange = (year: number | "lastPeriod") => {
  let filteryear: number, filtermonth: number;
  if (year === "lastPeriod") {
    const now = new Date();
    filteryear = now.getFullYear()
    filtermonth = now.getMonth() + 1
  } else {
    filteryear = year
    filtermonth = 12
  }
  const startDT = new Date(filteryear - (filtermonth === 12 ? 0 : 1), (filtermonth === 12 ? 1 : filtermonth + 1) - 1, 1);
  startDT.setHours(0, 0, 0, 0);
  const endDT = new Date(filteryear, filtermonth, 0);
  endDT.setHours(23, 59, 59, 999);

  startDT.setHours(0, 0, 0, 0);
  endDT.setHours(23, 59, 59, 999);

  return { startDT, endDT };
}

export const getSingleMonthRange = (year: number | "lastPeriod", month: number | "lastPeriod") => {
  let startDT, endDT;
  if (month === "lastPeriod" || year === "lastPeriod") {
    const now = new Date();
    startDT = new Date(now.getFullYear(), now.getMonth(), 1);
    endDT = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  } else {
    startDT = new Date(year, month, 1);
    endDT = new Date(year, month + 1, 0);
  }
  startDT.setHours(0, 0, 0, 0);
  endDT.setHours(23, 59, 59, 999);

  return { startDT, endDT };
}

export const getSingleQuarterRange = (year: number | "lastPeriod", quarter: number | "lastPeriod") => {
  let startDT, endDT, currentYear, currentQuarter;

  if (year === "lastPeriod" || quarter === "lastPeriod") {
    const now = new Date();
    currentQuarter = getQuarter(now);
    currentYear = now.getFullYear();
  } else {
    currentQuarter = quarter;
    currentYear = year;
  }

  startDT = new Date(currentYear, (currentQuarter - 1) * 3, 1);
  endDT = new Date(currentYear, (currentQuarter * 3), 0);
  startDT.setHours(0, 0, 0, 0);
  endDT.setHours(23, 59, 59, 999);

  return { startDT, endDT };
}

export const getSingleWeekRange = (year: number | "lastPeriod", week: number | "lastPeriod") => {
  let startDT, endDT;
  const theWeek = week === "lastPeriod" ? getWeekNumber(new Date()) : week;

  if (year === "lastPeriod" || week === "lastPeriod") {
    const now = new Date();
    startDT = getDateOfIsoWeek(now.getFullYear(), theWeek);
    endDT = lastDayOfWeek(now.getFullYear(), theWeek);
  } else {
    startDT = getDateOfIsoWeek(year, theWeek);
    endDT = lastDayOfWeek(year, theWeek);
  }

  startDT.setHours(0, 0, 0, 0);
  endDT.setHours(23, 59, 59, 999);

  return { startDT, endDT };
}

// export const calculateStartWeek = (endweek: number, year: number): number => {
//     const weeksInYear = getWeeksInYear(year);
//     return endweek - 12 < 1 ? weeksInYear + endweek - 12 : endweek - 12;
// };

// export const getWeeksInYear = (year: number): number => {
//     const lastDayOfYear = new Date(year, 11, 31);
//     const weekNumber = getWeekNumber(lastDayOfYear);
//     return weekNumber === 1 ? 52 : weekNumber; // If the last day is in week 1, the year has 52 weeks
// };

export const getAdjustedStartEndDates = (
  startDT: Date | undefined,
  endDT: Date | undefined,
  dayBeginsAt: string | undefined
) => {
  // Calculate diff to apply because of municipality specific start time
  const dayBeginsAtDateTime: string = moment(dayBeginsAt ? dayBeginsAt : new Date(0, 0, 0)).utc().format('YYYY-MM-DD HH:mm');
  const timeIntervalInMinutes = new Date(dayBeginsAtDateTime).getHours() * 60 + new Date(dayBeginsAtDateTime).getMinutes();

  const adjustedStartDate = undefined !== startDT ? moment(startDT).add(timeIntervalInMinutes, 'minutes') : undefined;
  const adjustedEndDate = undefined !== endDT ? moment(endDT).add(timeIntervalInMinutes, 'minutes') : undefined;

  return { timeIntervalInMinutes, adjustedStartDate, adjustedEndDate };
}

export const getStartEndDT = (state: ReportState, firstDate: Date, lastDate: Date) => {
  switch (state.reportRangeUnit) {
    case "range_all": {
      const startDT = new Date(firstDate);
      startDT.setHours(0, 0, 0, 0);
      const endDT = new Date(lastDate);
      endDT.setHours(23, 59, 59, 999);

      return { startDT, endDT };
    }
    case "range_year": {
      return getSingleYearRange(state.reportRangeYear);
    }
    case "range_month": {
      return getSingleMonthRange(state.reportRangeYear, state.reportRangeValue);
    }
    case "range_quarter": {
      return getSingleQuarterRange(state.reportRangeYear, state.reportRangeValue);
    }
    case "range_week": {
      return getSingleWeekRange(state.reportRangeYear, state.reportRangeValue);
    }
    case "range_custom": {
      const startDT = state.customStartDate ? new Date(state.customStartDate) : new Date(firstDate);
      const endDT = state.customEndDate ? new Date(state.customEndDate) : new Date(lastDate);

      if (!state.customStartDate) {
        startDT.setHours(0, 0, 0, 0);
      }
      if (!state.customEndDate) {
        endDT.setHours(23, 59, 59, 999);
      }

      return { startDT, endDT };
    }
    default: {
      console.warn("Unhandled reportUnit", state.reportRangeUnit);
      return { startDT: new Date(), endDT: new Date() };
    }
  }
}
