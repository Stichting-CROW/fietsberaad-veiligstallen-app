// ReportDateUtils.ts
// enums.ts
export enum DayOfWeek {
    MONDAY = 1,
    TUESDAY,
    WEDNESDAY,
    THURSDAY,
    FRIDAY,
    SATURDAY,
    SUNDAY
}

class ReportDateUtils {
    /**
     * Returns the ISO day of the week for a given date.
     * @param date - The date for which to find the ISO day of the week.
     * @param firstDayOfWeek - The first day of the week (1 = Sunday, default is 2 for Monday).
     * @returns The ISO day of the week.
     */
    public static ISODayOfWeek(date: Date): number {
        const day = date.getUTCDay();
        return ((day + 6) % 7) + 1; // Adjusting to ISO (Monday = 1, Sunday = 7)
    }

    /**
     * Returns the week number according to the ISO standard.
     * @param date - The date for which to find the ISO week number.
     * @returns The ISO week number.
     */
    public static ISOWeek(date: Date): number {
        const target = new Date(date.valueOf());
        const dayNumber = (date.getUTCDay() + 6) % 7; // ISO day of week
        target.setUTCDate(target.getUTCDate() - dayNumber + 3); // Thursday of the current week
        const firstThursday = new Date(target.getUTCFullYear(), 0, 4);
        const diff = target.valueOf() - firstThursday.valueOf();
        return 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
    }

    /**
     * Returns the date for the first day of the week for a given date.
     * @param date - The date for which to find the first day of the week.
     * @returns The date of the first day of the week.
     */
    public static ISOfirstDayOfWeek(date: Date): Date {
        const dayOfWeek = ReportDateUtils.ISODayOfWeek(date);
        const firstDay = new Date(date);
        firstDay.setUTCDate(date.getUTCDate() - dayOfWeek + 1);
        return firstDay;
    }

    /**
     * Returns the last day of the week for a given date.
     * @param date - The date for which to find the last day of the week.
     * @returns The date of the last day of the week.
     */
    public static ISOlastDayOfWeek(date: Date): Date {
        const dayOfWeek = ReportDateUtils.ISODayOfWeek(date);
        const lastDay = new Date(date);
        lastDay.setUTCDate(date.getUTCDate() + (7 - dayOfWeek));
        return lastDay;
    }

    public getNthOccOfDayInMonth(nthOccurrence: number, theDayOfWeek: DayOfWeek, theMonth: number, theYear: number): number {
        const firstDayOfMonth = new Date(theYear, theMonth - 1, 1);
        const firstDayOfWeek = firstDayOfMonth.getDay() || 7; // Adjust for ISO week (Monday = 1, Sunday = 7)

        const dayInMonth = 1 + (nthOccurrence - 1) * 7 + (theDayOfWeek - firstDayOfWeek + 7) % 7;

        const lastDayOfMonth = new Date(theYear, theMonth, 0).getDate();
        if (dayInMonth > lastDayOfMonth || dayInMonth < 1) {
            return -1;
        }
        return dayInMonth;
    }

    public getWeekStartDate(weekNum: number, weekYear: number): Date {
        const date = new Date(Date.UTC(weekYear, 0, 1 + (weekNum - 1) * 7));
        const dayOfWeek = date.getUTCDay();
        const ISOweekStart = date;
        if (dayOfWeek <= 4) {
            ISOweekStart.setUTCDate(date.getUTCDate() - date.getUTCDay() + 1);
        } else {
            ISOweekStart.setUTCDate(date.getUTCDate() + 8 - date.getUTCDay());
        }
        return ISOweekStart;
    }

    public getLastDayOfMonth(date: Date): Date {
        const year = date.getFullYear();
        const month = date.getMonth();
        return new Date(year, month + 1, 0);
    }
}

export default ReportDateUtils;