import moment, { utc } from "moment";
import { type PeriodPreset, type ReportRangeUnit, type ReportState } from "./ReportsFilter";

const normalizeStartOfDay = (input: Date) => {
  const normalized = new Date(input);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
};

const normalizeEndOfDay = (input: Date) => {
  const normalized = new Date(input);
  normalized.setHours(23, 59, 59, 999);
  return normalized;
};

const clampDate = (date: Date, min: Date, max: Date) => {
  if (date < min) {
    return new Date(min);
  }
  if (date > max) {
    return new Date(max);
  }
  return date;
};

const clampRange = (start: Date, end: Date, firstDate: Date, lastDate: Date) => {
  const min = normalizeStartOfDay(firstDate);
  const max = normalizeEndOfDay(lastDate);

  const clampedStart = clampDate(start, min, max);
  const clampedEnd = clampDate(end, min, max);

  if (clampedStart > clampedEnd) {
    return { startDT: new Date(min), endDT: new Date(min) };
  }

  return { startDT: clampedStart, endDT: clampedEnd };
};

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
  const numericWeek = Number(week);
  const numericYear = Number(year);

  if (numericWeek < 1 || numericWeek > 53) {
    throw new RangeError("ISO 8601 weeks are numbered from 1 to 53");
  } else if (!Number.isInteger(numericWeek)) {
    throw new TypeError("Week must be an integer");
  } else if (!Number.isInteger(numericYear)) {
    throw new TypeError("Year must be an integer");
  }

  const simple = new Date(numericYear, 0, 1 + (numericWeek - 1) * 7);
  const dayOfWeek = simple.getDay();
  const isoWeekStart = simple;

  // Get the Monday past, and add a week if the day was
  // Friday, Saturday or Sunday.

  isoWeekStart.setDate(simple.getDate() - dayOfWeek + 1);
  if (dayOfWeek > 4) {
    isoWeekStart.setDate(isoWeekStart.getDate() + 7);
  }

  // The latest possible ISO week starts on December 28 of the current year.
  if (isoWeekStart.getFullYear() > numericYear ||
    (isoWeekStart.getFullYear() == numericYear &&
      isoWeekStart.getMonth() == 11 &&
      isoWeekStart.getDate() > 28)) {
    throw new RangeError(`${numericYear} has no ISO week ${numericWeek}`);
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
    filteryear = now.getFullYear();
    filtermonth = now.getMonth() + 1;
  } else {
    filteryear = year;
    filtermonth = 12;
  }
  const yearStart = normalizeStartOfDay(new Date(filteryear - (filtermonth === 12 ? 0 : 1), (filtermonth === 12 ? 1 : filtermonth + 1) - 1, 1));
  let endDT = normalizeEndOfDay(new Date(filteryear, filtermonth, 0));
  
  // If using lastPeriod, don't exceed yesterday since there's no data for today in the cache
  if (year === "lastPeriod") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const maxEndDate = normalizeEndOfDay(yesterday);
    // If the start of the year period is after yesterday, use previous year instead
    if (yearStart > maxEndDate) {
      // Use previous year (full year)
      const prevYear = filteryear - 1;
      const startDT = normalizeStartOfDay(new Date(prevYear, 0, 1));
      const prevYearEnd = normalizeEndOfDay(new Date(prevYear, 11, 31));
      return { startDT, endDT: prevYearEnd };
    }
    if (endDT > maxEndDate) {
      endDT = maxEndDate;
    }
  }

  return { startDT: yearStart, endDT };
};

export const getSingleMonthRange = (year: number | "lastPeriod", month: number | "lastPeriod") => {
  let startDT: Date, endDT: Date;
  if (month === "lastPeriod" || year === "lastPeriod") {
    const now = new Date();
    const monthStart = normalizeStartOfDay(new Date(now.getFullYear(), now.getMonth(), 1));
    // Don't exceed yesterday since there's no data for today in the cache
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const maxEndDate = normalizeEndOfDay(yesterday);
    // If the start of current month is after yesterday, use previous month instead
    if (monthStart > maxEndDate) {
      // Use previous month
      const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      startDT = normalizeStartOfDay(prevMonth);
      endDT = normalizeEndOfDay(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0));
    } else {
      startDT = monthStart;
      let monthEnd = normalizeEndOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      endDT = monthEnd > maxEndDate ? maxEndDate : monthEnd;
    }
  } else {
    startDT = normalizeStartOfDay(new Date(year, month, 1));
    endDT = normalizeEndOfDay(new Date(year, month + 1, 0));
  }

  return { startDT, endDT };
};

export const getSingleQuarterRange = (year: number | "lastPeriod", quarter: number | "lastPeriod") => {
  let startDT: Date, endDT: Date, currentYear: number, currentQuarter: number;

  if (year === "lastPeriod" || quarter === "lastPeriod") {
    const now = new Date();
    currentQuarter = getQuarter(now);
    currentYear = now.getFullYear();
  } else {
    currentQuarter = quarter;
    currentYear = year;
  }

  const quarterStart = normalizeStartOfDay(new Date(currentYear, (currentQuarter - 1) * 3, 1));
  let quarterEnd = normalizeEndOfDay(new Date(currentYear, currentQuarter * 3, 0));
  
  // If using lastPeriod, don't exceed yesterday since there's no data for today in the cache
  if (year === "lastPeriod" || quarter === "lastPeriod") {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const maxEndDate = normalizeEndOfDay(yesterday);
    // If the start of current quarter is after yesterday, use previous quarter instead
    if (quarterStart > maxEndDate) {
      // Use previous quarter
      const prevQuarter = currentQuarter === 1 ? 4 : currentQuarter - 1;
      const prevQuarterYear = currentQuarter === 1 ? currentYear - 1 : currentYear;
      startDT = normalizeStartOfDay(new Date(prevQuarterYear, (prevQuarter - 1) * 3, 1));
      endDT = normalizeEndOfDay(new Date(prevQuarterYear, prevQuarter * 3, 0));
    } else {
      startDT = quarterStart;
      if (quarterEnd > maxEndDate) {
        quarterEnd = maxEndDate;
      }
      endDT = quarterEnd;
    }
  } else {
    startDT = quarterStart;
    endDT = quarterEnd;
  }

  return { startDT, endDT };
};

export const getSingleWeekRange = (year: number | "lastPeriod", week: number | "lastPeriod") => {
  let startDT: Date, endDT: Date;
  const theWeek = week === "lastPeriod" ? getWeekNumber(new Date()) : week;

  if (year === "lastPeriod" || week === "lastPeriod") {
    const now = new Date();
    const weekStart = getDateOfIsoWeek(now.getFullYear(), theWeek);
    const normalizedWeekStart = normalizeStartOfDay(weekStart);
    // Don't exceed yesterday since there's no data for today in the cache
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const maxEndDate = normalizeEndOfDay(yesterday);
    // If the start of current week is after yesterday, use previous week instead
    if (normalizedWeekStart > maxEndDate) {
      // Use previous week (go back 7 days from start of current week)
      const prevWeekStart = new Date(weekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);
      startDT = normalizeStartOfDay(prevWeekStart);
      const prevWeekEnd = new Date(prevWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);
      endDT = normalizeEndOfDay(prevWeekEnd);
    } else {
      startDT = normalizedWeekStart;
      let weekEnd = lastDayOfWeek(now.getFullYear(), theWeek);
      const normalizedWeekEnd = normalizeEndOfDay(weekEnd);
      endDT = normalizedWeekEnd > maxEndDate ? maxEndDate : normalizedWeekEnd;
    }
  } else {
    startDT = normalizeStartOfDay(getDateOfIsoWeek(year, theWeek));
    endDT = normalizeEndOfDay(lastDayOfWeek(year, theWeek));
  }

  return {
    startDT: startDT,
    endDT: endDT,
  };
};

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

type PresetRange = {
  startDT: Date;
  endDT: Date;
  reportRangeUnit: ReportRangeUnit;
};

export const getRangeForPreset = (
  preset: PeriodPreset,
  {
    now = new Date(),
    firstDate,
    lastDate,
  }: {
    now?: Date;
    firstDate: Date;
    lastDate: Date;
  }
): PresetRange => {
  const unitByPreset: Record<PeriodPreset, ReportRangeUnit> = {
    deze_week: "range_week",
    deze_maand: "range_month",
    dit_kwartaal: "range_quarter",
    dit_jaar: "range_year",
    afgelopen_7_dagen: "range_custom",
    afgelopen_30_dagen: "range_custom",
    afgelopen_12_maanden: "range_custom",
    alles: "range_all",
  };

  const normalizedNow = normalizeStartOfDay(now);
  // Calculate yesterday as the maximum end date since there's no data for today in the cache
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const maxEndDate = normalizeEndOfDay(yesterday);

  let startDT: Date;
  let endDT: Date;

  switch (preset) {
    case "deze_week": {
      const startOfWeek = new Date(normalizedNow);
      const day = startOfWeek.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      startOfWeek.setDate(startOfWeek.getDate() + diff);
      const normalizedStartOfWeek = normalizeStartOfDay(startOfWeek);
      // If the start of current week is after yesterday, use previous week instead
      if (normalizedStartOfWeek > maxEndDate) {
        // Use previous week (go back 7 days from start of current week)
        const prevWeekStart = new Date(startOfWeek);
        prevWeekStart.setDate(prevWeekStart.getDate() - 7);
        startDT = normalizeStartOfDay(prevWeekStart);
        const prevWeekEnd = new Date(prevWeekStart);
        prevWeekEnd.setDate(prevWeekEnd.getDate() + 6);
        endDT = normalizeEndOfDay(prevWeekEnd);
      } else {
        startDT = normalizedStartOfWeek;
        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 6);
        endDT = normalizeEndOfDay(endOfWeek);
        // Don't exceed yesterday
        if (endDT > maxEndDate) {
          endDT = maxEndDate;
        }
      }
      break;
    }
    case "deze_maand": {
      const monthStart = normalizeStartOfDay(new Date(normalizedNow.getFullYear(), normalizedNow.getMonth(), 1));
      // If the start of current month is after yesterday, use previous month instead
      if (monthStart > maxEndDate) {
        // Use previous month
        const prevMonth = new Date(normalizedNow.getFullYear(), normalizedNow.getMonth() - 1, 1);
        startDT = normalizeStartOfDay(prevMonth);
        endDT = normalizeEndOfDay(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0));
      } else {
        startDT = monthStart;
        const monthEnd = normalizeEndOfDay(new Date(normalizedNow.getFullYear(), normalizedNow.getMonth() + 1, 0));
        // Don't exceed yesterday
        endDT = monthEnd > maxEndDate ? maxEndDate : monthEnd;
      }
      break;
    }
    case "dit_kwartaal": {
      const quarter = getQuarter(normalizedNow);
      const quarterStart = normalizeStartOfDay(new Date(normalizedNow.getFullYear(), (quarter - 1) * 3, 1));
      // If the start of current quarter is after yesterday, use previous quarter instead
      if (quarterStart > maxEndDate) {
        // Use previous quarter
        const prevQuarter = quarter === 1 ? 4 : quarter - 1;
        const prevQuarterYear = quarter === 1 ? normalizedNow.getFullYear() - 1 : normalizedNow.getFullYear();
        startDT = normalizeStartOfDay(new Date(prevQuarterYear, (prevQuarter - 1) * 3, 1));
        endDT = normalizeEndOfDay(new Date(prevQuarterYear, prevQuarter * 3, 0));
      } else {
        startDT = quarterStart;
        const quarterEnd = normalizeEndOfDay(new Date(normalizedNow.getFullYear(), quarter * 3, 0));
        // Don't exceed yesterday
        endDT = quarterEnd > maxEndDate ? maxEndDate : quarterEnd;
      }
      break;
    }
    case "dit_jaar": {
      const yearStart = normalizeStartOfDay(new Date(normalizedNow.getFullYear(), 0, 1));
      // If the start of current year is after yesterday, use previous year instead
      if (yearStart > maxEndDate) {
        // Use previous year
        const prevYear = normalizedNow.getFullYear() - 1;
        startDT = normalizeStartOfDay(new Date(prevYear, 0, 1));
        endDT = normalizeEndOfDay(new Date(prevYear, 11, 31));
      } else {
        startDT = yearStart;
        const yearEnd = normalizeEndOfDay(new Date(normalizedNow.getFullYear(), 11, 31));
        // Don't exceed yesterday
        endDT = yearEnd > maxEndDate ? maxEndDate : yearEnd;
      }
      break;
    }
    case "afgelopen_7_dagen": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const end = normalizeEndOfDay(yesterday);
      const start = normalizeStartOfDay(new Date(end));
      start.setDate(start.getDate() - 6);
      startDT = start;
      endDT = end;
      break;
    }
    case "afgelopen_30_dagen": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const end = normalizeEndOfDay(yesterday);
      const start = normalizeStartOfDay(new Date(end));
      start.setDate(start.getDate() - 29);
      startDT = start;
      endDT = end;
      break;
    }
    case "afgelopen_12_maanden": {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      const end = normalizeEndOfDay(yesterday);
      // Use 12 calendar months instead of fixed 365 days
      // Start from the day after (end date - 12 months) to make it exactly 12 months
      const start = new Date(end);
      start.setMonth(start.getMonth() - 12);
      start.setDate(start.getDate() + 1); // Add one day to exclude the start day itself
      startDT = normalizeStartOfDay(start);
      endDT = end;
      break;
    }
    case "alles":
    default: {
      startDT = normalizeStartOfDay(new Date(firstDate));
      endDT = normalizeEndOfDay(new Date(lastDate));
      break;
    }
  }

  const { startDT: clampedStart, endDT: clampedEnd } = clampRange(startDT, endDT, firstDate, lastDate);

  return {
    startDT: clampedStart,
    endDT: clampedEnd,
    reportRangeUnit: unitByPreset[preset],
  };
};

export const getStartEndDT = (state: ReportState, firstDate: Date, lastDate: Date) => {
  const fallbackStart = normalizeStartOfDay(new Date(firstDate));
  const fallbackEnd = normalizeEndOfDay(new Date(lastDate));

  const parseDate = (input?: string) => {
    if (!input) return undefined;
    const parsed = new Date(input);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }
    return parsed;
  };

  const customStart = parseDate(state.customStartDate);
  const customEnd = parseDate(state.customEndDate);

  if (customStart && customEnd) {
    const normalizedStart = normalizeStartOfDay(customStart);
    const normalizedEnd = normalizeEndOfDay(customEnd);

    if (normalizedStart <= normalizedEnd) {
      return clampRange(normalizedStart, normalizedEnd, firstDate, lastDate);
    }
  }

  if (state.activePreset) {
    const { startDT, endDT } = getRangeForPreset(state.activePreset, { firstDate, lastDate });
    return { startDT, endDT };
  }

  if (state.reportRangeUnit === "range_all") {
    return clampRange(fallbackStart, fallbackEnd, firstDate, lastDate);
  }

  return clampRange(fallbackStart, fallbackEnd, firstDate, lastDate);
};
