import moment from "moment";
import { type ReportGrouping } from "~/components/beheer/reports/ReportsFilter";
// import { debugLog } from "~/backend/services/reports/ReportFunctions";

export type XAxisLabelMap = Record<string, string>;

export const getXAxisTitle = (reportGrouping: ReportGrouping) => {
  switch (reportGrouping) {
    case 'per_hour_time': return 'Uur';
    case 'per_quarter_hour': return 'Kwartier';
    case 'per_hour': return 'Uur';
    case 'per_week': return 'Week';
    case 'per_weekday': return 'Dag van de week';
    case 'per_day': return 'Dag';
    case 'per_month': return 'Maand';
    case 'per_quarter': return 'Kwartaal';
    case 'per_year': return 'Jaar';
    case 'per_bucket': return 'Stallingsduur';
    default: return 'onbekend';
  }
}

export const getXAxisFormatter = (reportGrouping: ReportGrouping) => (value: string) => {
  switch (reportGrouping) {
    case 'per_hour_time': {
      return moment(value).format('DD MMM HH:00');
    }
    case 'per_quarter_hour': {
      return moment(value).format('DD MMM HH:mm');
    }
    case 'per_hour': {
      // Value is a timestamp in milliseconds, convert to hour format "HH:00"
      return moment(parseFloat(value)).format('HH:00');
    }
    case 'per_weekday': {
      return ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'][parseInt(value)];
    }
    case 'per_day': {
      return moment(value).format('YYYY-MM-DD');
    }
    case 'per_month': {
      return moment(value).format('YYYY-M');
    }
    case 'per_week': {
      return moment(value).format('YYYY-\\wW');
    }
    case 'per_quarter': {
      return moment(value).format('YYYY-Q');
    }
    case 'per_year': {
      return moment(value).format('YYYY');
    }
    case 'per_bucket': {
      //   const buckets = [
      //     "<30m",
      //     "30-60m",
      //     "1-2h",
      //     "2-4h",
      //     "4-8h",
      //     "8-24h",
      //     "1-2d",
      //     "2-7d",
      //     "7-14d",
      //     ">14d"
      //   ];
      return ['<30m', '30-60m', '1-2h', '2-4h', '4-8h', '8-24h', '1-2d', '2-7d', '7-14d', '>14d'][parseInt(value)];
    }
    default:
      return value;
  }
}

export const getLabelMapForXAxis = (reportGrouping: ReportGrouping, startDate: Date, endDate: Date): XAxisLabelMap => {
  switch (reportGrouping) {
    case 'per_hour_time': {
      const labelMap: XAxisLabelMap = {};
      for (let date = moment(startDate); date.isSameOrBefore(endDate); date.add(1, 'hour')) {
        labelMap[date.format('YYYY-MM-DD HH:00')] = date.format('DD MMM HH:00');
      }
      return labelMap;
    }
    case 'per_quarter_hour': {
      const labelMap: XAxisLabelMap = {};
      for (let date = moment(startDate); date.isSameOrBefore(endDate); date.add(15, 'minutes')) {
        labelMap[date.format('YYYY-MM-DD HH:mm')] = date.format('DD MMM HH:mm');
      }
      return labelMap;
    }
    case 'per_hour': {
      const labelMap: XAxisLabelMap = {};
      Array.from({ length: 24 }, (_, i) => (labelMap[i.toString()] = i.toString() + ":00"));
      // console.log(labelMap);
      return labelMap;
    }
    case 'per_weekday': {
      const labelMap: XAxisLabelMap = {};
      labelMap['0'] = 'ma';
      labelMap['1'] = 'di';
      labelMap['2'] = 'wo';
      labelMap['3'] = 'do';
      labelMap['4'] = 'vr';
      labelMap['5'] = 'za';
      labelMap['6'] = 'zo';
      return labelMap;
    }
    case 'per_day': {
      const labelMap: XAxisLabelMap = {};
      for (let date = moment(startDate); date.isBefore(endDate); date.add(1, 'day')) {
        labelMap[date.format('YYYY-DDD')] = date.format('MMM-D');
      }
      return labelMap;
    }
    case 'per_month': {
      const labelMap: XAxisLabelMap = {};
      const startKey = moment(startDate).startOf('month');
      const endKey = moment(endDate).endOf('month');
      for (let date = moment(startKey); date.isBefore(endKey); date.add(1, 'month')) {
        if (moment(startDate).year() === moment(endDate).year()) {
          // use locale month name
          labelMap[date.format('YYYY-M')] = date.format('MMM');
        } else {
          labelMap[date.format('YYYY-M')] = date.format('MMM-YYYY');
        }
      }
      return labelMap;
    }
    case 'per_week': {
      const labelMap: XAxisLabelMap = {};
      const startKey = moment(startDate).isoWeek(moment(startDate).isoWeek()).startOf('isoWeek');
      const endKey = moment(endDate).isoWeek(moment(endDate).isoWeek()).endOf('isoWeek');
      for (let date = moment(startKey); date.isBefore(endKey); date.add(1, 'week')) {
        labelMap[date.format('YYYY-W')] = date.format('YYYY-WW');
      }
      return labelMap;
    }
    case 'per_quarter': {
      const labelMap: XAxisLabelMap = {};
      const startKey = moment(startDate).startOf('quarter');
      const endKey = moment(endDate).endOf('quarter');
      for (let date = moment(startKey); date.isBefore(endKey); date.add(1, 'quarter')) {
        labelMap[date.format('YYYY-Q')] = date.format('YYYY-Q');
      }
      return labelMap;
    }
    case 'per_year': {
      const labelMap: XAxisLabelMap = {};
      const startKey = moment(startDate).startOf('year');
      const endKey = moment(endDate).endOf('year');
      for (let date = moment(startKey); date.isBefore(endKey); date.add(1, 'year')) {
        labelMap[date.format('YYYY')] = date.format('YYYY');
      }
      return labelMap;
    }
    case 'per_bucket': {
      const labelMap: XAxisLabelMap = {};
      //   const buckets = [
      //     "<30m",
      //     "30-60m",
      //     "1-2h",
      //     "2-4h",
      //     "4-8h",
      //     "8-24h",
      //     "1-2d",
      //     "2-7d",
      //     "7-14d",
      //     ">14d"
      //   ];
      labelMap["1"] = '<30m';
      labelMap["2"] = '30-60m';
      labelMap["3"] = '1-2h';
      labelMap["4"] = '2-4h';
      labelMap["5"] = '4-8h';
      labelMap["6"] = '8-24h';
      labelMap["7"] = '1-2d';
      labelMap["8"] = '2-7d';
      labelMap["9"] = '7-14d';
      labelMap[""] = '>14d';
      return labelMap;
    }
    default:
      return {} as XAxisLabelMap;
  }
}

// export const testReportUnitLabels = () => {
//   debugLog("TEST REPORT UNIT LABELS", true);
//   const testCase = (grouping: ReportGrouping, rangeStart: Date, rangeEnd: Date) => {
//     debugLog(`TEST CASE ${grouping} ${rangeStart} ${rangeEnd}`);
//     debugLog(`${JSON.stringify(getLabelMapForXAxis(grouping, rangeStart, rangeEnd))}`);
//   }
//   const rangestart = moment('2024-01-01 00:00Z+1').toDate();
//   const rangeend = moment('2024-01-31 23:59Z+1').toDate();  

//   testCase('per_hour', rangestart, rangeend);
//   testCase('per_weekday', rangestart, rangeend);
//   testCase('per_day', rangestart, rangeend);
//   testCase('per_month', rangestart, rangeend);
//   testCase('per_quarter', rangestart, rangeend);
//   testCase('per_year', rangestart, rangeend);
// }

export const getCategoriesForXAxis = (labels: XAxisLabelMap): string[] => {
  return Object.keys(labels);
}

/**
 * Get tooltip formatter for chart tooltips
 * Adds day of week (in Dutch) for quarter hours, hours, and days
 */
export const getTooltipFormatter = (reportGrouping: ReportGrouping) => {
  // Dutch day abbreviations
  const dayAbbreviations = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];
  
  return (value: string | number, opts?: any) => {
    // Get the category label from the chart's categories array
    // For category-based charts, ApexCharts stores categories in multiple possible locations
    const categoryLabel = (() => {
      const dataPointIndex =
        opts?.dataPointIndex ??
        opts?.index ??
        opts?.w?.globals?.dataPointIndex ??
        0;
      
      // Try multiple paths to find the categories array
      const categories =
        opts?.w?.config?.xaxis?.categories ??
        opts?.w?.globals?.categoryLabels ??
        opts?.w?.globals?.labels;
      
      if (categories && Array.isArray(categories) && categories[dataPointIndex] !== undefined) {
        return categories[dataPointIndex];
      }
      
      return undefined;
    })();

    // For quarter hours, hours, and days, add day of week
    if (reportGrouping === 'per_quarter_hour' || reportGrouping === 'per_hour_time' || reportGrouping === 'per_day') {
      let date: moment.Moment | null = null;
      
      // First, try to get the actual timestamp from the data point
      // ApexCharts provides the timestamp in opts.w.globals.seriesX
      if (opts && opts.w && opts.w.globals && opts.w.globals.seriesX && opts.w.globals.seriesX.length > 0) {
        const seriesIndex = opts.seriesIndex ?? 0;
        const dataPointIndex = opts.dataPointIndex ?? opts.index ?? 0;
        const seriesX = opts.w.globals.seriesX[seriesIndex];
        if (seriesX && seriesX[dataPointIndex] !== undefined) {
          const timestamp = seriesX[dataPointIndex];
          if (typeof timestamp === 'number') {
            date = moment(timestamp);
          }
        }
      }
      
      // If we couldn't get timestamp from opts, try to parse the value
      if (!date || !date.isValid()) {
        if (typeof value === 'number') {
          // Value is a timestamp in milliseconds
          date = moment(value);
        } else if (typeof value === 'string') {
          // The tooltip receives the category label (formatted)
          // For per_hour_time: "DD MMM HH:00" (e.g., "07 Jan 05:00")
          // For per_quarter_hour: "DD MMM HH:mm" (e.g., "07 Jan 05:15")
          // For per_day: "MMM-D" (e.g., "Jan-7")
          if (reportGrouping === 'per_hour_time') {
            // Try parsing "DD MMM HH:00" format
            date = moment(value, 'DD MMM HH:mm', true);
            if (!date.isValid()) {
              date = moment(value, 'DD MMM HH:00', true);
            }
            // If still invalid, try with current year
            if (!date.isValid()) {
              const parts = value.match(/(\d{1,2})\s+(\w{3})\s+(\d{1,2}):(\d{2})/);
              if (parts) {
                date = moment(`${moment().year()} ${parts[2]} ${parts[1]} ${parts[3]}:${parts[4]}`, 'YYYY MMM DD HH:mm');
              }
            }
          } else if (reportGrouping === 'per_quarter_hour') {
            // Try parsing "DD MMM HH:mm" format
            date = moment(value, 'DD MMM HH:mm', true);
            // If invalid, try with current year
            if (!date.isValid()) {
              const parts = value.match(/(\d{1,2})\s+(\w{3})\s+(\d{1,2}):(\d{2})/);
              if (parts) {
                date = moment(`${moment().year()} ${parts[2]} ${parts[1]} ${parts[3]}:${parts[4]}`, 'YYYY MMM DD HH:mm');
              }
            }
          } else if (reportGrouping === 'per_day') {
            // Try parsing "MMM-D" format (e.g., "Jan-7")
            date = moment(value, 'MMM-D', true);
            // If invalid, try "YYYY-MM-DD" or "YYYY-DDD"
            if (!date.isValid()) {
              date = moment(value, 'YYYY-MM-DD', true);
            }
            if (!date.isValid()) {
              // Parse "YYYY-DDD" format (year-dayOfYear)
              const parts = value.split('-');
              if (parts.length === 2) {
                const year = parseInt(parts[0] || '0');
                const dayOfYear = parseInt(parts[1] || '0');
                if (year > 0 && dayOfYear > 0) {
                  date = moment().year(year).dayOfYear(dayOfYear);
                }
              }
            }
            // If still invalid, try with current year
            if (!date.isValid()) {
              const parts = value.match(/(\w{3})-(\d{1,2})/);
              if (parts) {
                date = moment(`${moment().year()} ${parts[1]} ${parts[2]}`, 'YYYY MMM D');
              }
            }
          }
        }
      }
      
      if (!date || !date.isValid()) {
        return categoryLabel ?? value;
      }
      
      const dayOfWeek = dayAbbreviations[date.day()] || '';
      
      if (reportGrouping === 'per_hour_time') {
        // Format: "Zo 7 Jan 05:00"
        return `${dayOfWeek} ${date.format('D MMM HH:00')}`;
      } else if (reportGrouping === 'per_quarter_hour') {
        // Format: "Zo 7 Jan 05:15"
        return `${dayOfWeek} ${date.format('D MMM HH:mm')}`;
      } else if (reportGrouping === 'per_day') {
        // Format: "Zo 7 Jan"
        return `${dayOfWeek} ${date.format('D MMM')}`;
      }
    }
    
    // For other groupings, prefer the category label; fall back to formatted dates or the raw value
    if (categoryLabel !== undefined) {
      return categoryLabel;
    }

    if (typeof value === 'number') {
      const date = moment(value);
      if (date.isValid()) {
        if (reportGrouping === 'per_week') {
          return date.format('GGGG-[W]WW');
        }
        if (reportGrouping === 'per_month') {
          return date.format('MMM YYYY');
        }
        if (reportGrouping === 'per_quarter') {
          return `Q${date.quarter()} ${date.year()}`;
        }
        if (reportGrouping === 'per_year') {
          return date.format('YYYY');
        }
      }
    }

    return value;
  };
}

// export const getXAxisFormatter = (labels: XAxisLabelMap) => (): ((value: string) => string) => {
//   return (value: string) => labels[value] || value;
// }
