import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { prisma } from "~/server/db";

interface Settings {
  contactID?: string | null;
  locationID?: string | null;
  year: number;
  intervalDurations: number[];
}

interface TransactionIntervalData {
  date: string;
  startTime: string;
  transactionsStarted: number;
  openTransactionsAtStart: number;
  transactionsEnded: {
    duration_leq_1h: number;
    duration_1_3h: number;
    duration_3_6h: number;
    duration_6_9h: number;
    duration_9_13h: number;
    duration_13_18h: number;
    duration_18_24h: number;
    duration_24_36h: number;
    duration_36_48h: number;
    duration_48h_1w: number;
    duration_1w_2w: number;
    duration_2w_3w: number;
    duration_gt_3w: number;
  };
}

// Calculate duration bucket for a transaction
function getDurationBucket(durationHours: number): string {
  if (durationHours <= 1) return 'duration_leq_1h';
  if (durationHours <= 3) return 'duration_1_3h';
  if (durationHours <= 6) return 'duration_3_6h';
  if (durationHours <= 9) return 'duration_6_9h';
  if (durationHours <= 13) return 'duration_9_13h';
  if (durationHours <= 18) return 'duration_13_18h';
  if (durationHours <= 24) return 'duration_18_24h';
  if (durationHours <= 36) return 'duration_24_36h';
  if (durationHours <= 48) return 'duration_36_48h';
  if (durationHours <= 168) return 'duration_48h_1w'; // 1 week = 168 hours
  if (durationHours <= 336) return 'duration_1w_2w'; // 2 weeks = 336 hours
  if (durationHours <= 504) return 'duration_2w_3w'; // 3 weeks = 504 hours
  return 'duration_gt_3w';
}

// Calculate interval start times for a day based on DayBeginsAt and intervalDurations
function calculateIntervalStartTimes(dayBeginsAt: Date, intervalDurations: number[]): Date[] {
  const startTimes: Date[] = [];
  let currentTime = new Date(dayBeginsAt);
  
  for (const duration of intervalDurations) {
    startTimes.push(new Date(currentTime));
    currentTime = new Date(currentTime.getTime() + duration * 60 * 60 * 1000);
  }
  
  return startTimes;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  console.log('[transacties_voltooid] API call started at', new Date().toISOString());
  
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.log('[transacties_voltooid] Authentication failed');
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  if (req.method !== 'POST') {
    console.log('[transacties_voltooid] Invalid method:', req.method);
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  try {
    const settings: Settings = req.body;
    console.log('[transacties_voltooid] Processing request with settings:', {
      locationID: settings.locationID,
      year: settings.year,
      intervalDurations: settings.intervalDurations,
      contactID: settings.contactID
    });

    // Validate settings
    if (!settings.year || !settings.intervalDurations || !Array.isArray(settings.intervalDurations)) {
      res.status(400).json({ error: "Invalid settings: year and intervalDurations are required" });
      return;
    }

    // Validate intervalDurations sum to 24 hours
    const totalHours = settings.intervalDurations.reduce((sum, hours) => sum + hours, 0);
    if (totalHours !== 24) {
      res.status(400).json({ error: "intervalDurations must sum to 24 hours" });
      return;
    }

    if (!settings.locationID) {
      res.status(400).json({ error: "locationID is required" });
      return;
    }

    // Get parking location and contact to retrieve DayBeginsAt
    const parkingQueryStart = Date.now();
    const parking = await prisma.fietsenstallingen.findFirst({
      where: {
        StallingsID: settings.locationID
      },
      include: {
        contacts_fietsenstallingen_SiteIDTocontacts: {
          select: {
            DayBeginsAt: true
          }
        }
      }
    });
    console.log('[transacties_voltooid] Parking query took', Date.now() - parkingQueryStart, 'ms');

    if (!parking) {
      console.log('[transacties_voltooid] Parking location not found:', settings.locationID);
      res.status(404).json({ error: "Parking location not found" });
      return;
    }

    // Get DayBeginsAt from contact (default to 00:00:00 if not set)
    // DayBeginsAt is a TIME field, so we extract hours and minutes
    const dayBeginsAtTime = parking.contacts_fietsenstallingen_SiteIDTocontacts?.DayBeginsAt;
    const dayBeginsAtHours = dayBeginsAtTime ? dayBeginsAtTime.getHours() : 0;
    const dayBeginsAtMinutes = dayBeginsAtTime ? dayBeginsAtTime.getMinutes() : 0;

    // Calculate date range for the year
    const yearStart = new Date(settings.year, 0, 1);
    const yearEnd = new Date(settings.year, 11, 31, 23, 59, 59);

    // Fetch all transactions for the location and year
    const transactionsQueryStart = Date.now();
    const transactions = await prisma.transacties_archief.findMany({
      where: {
        locationid: settings.locationID,
        OR: [
          {
            checkindate: {
              gte: yearStart,
              lte: yearEnd
            }
          },
          {
            checkoutdate: {
              gte: yearStart,
              lte: yearEnd
            }
          }
        ]
      },
      orderBy: {
        checkindate: 'asc'
      }
    });
    console.log('[transacties_voltooid] Transactions query took', Date.now() - transactionsQueryStart, 'ms');
    console.log('[transacties_voltooid] Found', transactions.length, 'transactions');

    // Generate all intervals for the year
    const intervals: Map<string, TransactionIntervalData> = new Map();
    
    // Calculate number of days in the year (handle leap years)
    const isLeapYear = (settings.year % 4 === 0 && settings.year % 100 !== 0) || (settings.year % 400 === 0);
    const daysInYear = isLeapYear ? 366 : 365;
    
    // Iterate through each day of the year
    for (let day = 0; day < daysInYear; day++) {
      const currentDate = new Date(settings.year, 0, 1);
      currentDate.setDate(currentDate.getDate() + day);
      
      // Calculate interval start times for this day
      const dayStart = new Date(currentDate);
      dayStart.setHours(dayBeginsAtHours, dayBeginsAtMinutes, 0, 0);
      
      const intervalStartTimes = calculateIntervalStartTimes(dayStart, settings.intervalDurations);
      
      // Create interval entries
      for (let i = 0; i < intervalStartTimes.length; i++) {
        const intervalStart = intervalStartTimes[i];
        const intervalDuration = settings.intervalDurations[i];
        if (!intervalStart || intervalDuration === undefined) continue;
        
        const intervalEnd = i < intervalStartTimes.length - 1 
          ? intervalStartTimes[i + 1]
          : new Date(intervalStart.getTime() + intervalDuration * 60 * 60 * 1000);
        
        const dateStr = currentDate.toISOString().split('T')[0];
        const timeStr = `${String(intervalStart.getHours()).padStart(2, '0')}:${String(intervalStart.getMinutes()).padStart(2, '0')}`;
        const intervalKey = `${dateStr}_${timeStr}`;
        
        intervals.set(intervalKey, {
          date: dateStr || '',
          startTime: timeStr || '',
          transactionsStarted: 0,
          openTransactionsAtStart: 0,
          transactionsEnded: {
            duration_leq_1h: 0,
            duration_1_3h: 0,
            duration_3_6h: 0,
            duration_6_9h: 0,
            duration_9_13h: 0,
            duration_13_18h: 0,
            duration_18_24h: 0,
            duration_24_36h: 0,
            duration_36_48h: 0,
            duration_48h_1w: 0,
            duration_1w_2w: 0,
            duration_2w_3w: 0,
            duration_gt_3w: 0
          }
        });
      }
    }

    // Process transactions
    for (const transaction of transactions) {
      const checkinDate = new Date(transaction.checkindate);
      const checkoutDate = transaction.checkoutdate ? new Date(transaction.checkoutdate) : null;

      // Find which interval the checkin belongs to
      const checkinDay = new Date(checkinDate);
      checkinDay.setHours(dayBeginsAtHours, dayBeginsAtMinutes, 0, 0);
      
      // Adjust if checkin is before dayBeginsAt (belongs to previous day)
      if (checkinDate.getHours() < dayBeginsAtHours || 
          (checkinDate.getHours() === dayBeginsAtHours && checkinDate.getMinutes() < dayBeginsAtMinutes)) {
        checkinDay.setDate(checkinDay.getDate() - 1);
      }

      const intervalStartTimes = calculateIntervalStartTimes(checkinDay, settings.intervalDurations);
      
        // Find the interval for checkin
        let checkinIntervalIndex = -1;
        for (let i = 0; i < intervalStartTimes.length; i++) {
          const intervalStart = intervalStartTimes[i];
          const intervalDuration = settings.intervalDurations[i];
          if (!intervalStart || intervalDuration === undefined) continue;
          
          const intervalEnd = i < intervalStartTimes.length - 1 
            ? (intervalStartTimes[i + 1] || new Date(intervalStart.getTime() + intervalDuration * 60 * 60 * 1000))
            : new Date(intervalStart.getTime() + intervalDuration * 60 * 60 * 1000);
        
          if (intervalEnd && checkinDate >= intervalStart && checkinDate < intervalEnd) {
            checkinIntervalIndex = i;
            break;
          }
        }

        if (checkinIntervalIndex >= 0) {
          const intervalStart = intervalStartTimes[checkinIntervalIndex];
          if (intervalStart) {
            const dateStr = checkinDay.toISOString().split('T')[0];
            const timeStr = `${String(intervalStart.getHours()).padStart(2, '0')}:${String(intervalStart.getMinutes()).padStart(2, '0')}`;
            const intervalKey = `${dateStr}_${timeStr}`;
            
            const interval = intervals.get(intervalKey);
            if (interval) {
              interval.transactionsStarted++;
            }
          }
        }

      // Count open transactions at start of each interval
      for (const [intervalKey, interval] of intervals.entries()) {
        const [dateStr, timeStr] = intervalKey.split('_');
        if (!dateStr || !timeStr) continue;
        const [hours, minutes] = timeStr.split(':').map(Number);
        if (hours === undefined || minutes === undefined) continue;
        const intervalStart = new Date(dateStr);
        intervalStart.setHours(hours, minutes, 0, 0);
        
        // Transaction is open at interval start if:
        // - checkinDate < intervalStart AND
        // - (checkoutDate is null OR checkoutDate >= intervalStart)
        if (checkinDate < intervalStart && (!checkoutDate || checkoutDate >= intervalStart)) {
          interval.openTransactionsAtStart++;
        }
      }

      // Count transactions ended in intervals
      if (checkoutDate) {
        const checkoutDay = new Date(checkoutDate);
        checkoutDay.setHours(dayBeginsAtHours, dayBeginsAtMinutes, 0, 0);
        
        // Adjust if checkout is before dayBeginsAt
        if (checkoutDate.getHours() < dayBeginsAtHours || 
            (checkoutDate.getHours() === dayBeginsAtHours && checkoutDate.getMinutes() < dayBeginsAtMinutes)) {
          checkoutDay.setDate(checkoutDay.getDate() - 1);
        }

        const checkoutIntervalStartTimes = calculateIntervalStartTimes(checkoutDay, settings.intervalDurations);
        
        // Find the interval for checkout
        for (let i = 0; i < checkoutIntervalStartTimes.length; i++) {
          const intervalStart = checkoutIntervalStartTimes[i];
          const intervalDuration = settings.intervalDurations[i];
          if (!intervalStart || intervalDuration === undefined) continue;
          
          const intervalEnd = i < checkoutIntervalStartTimes.length - 1 
            ? (checkoutIntervalStartTimes[i + 1] || new Date(intervalStart.getTime() + intervalDuration * 60 * 60 * 1000))
            : new Date(intervalStart.getTime() + intervalDuration * 60 * 60 * 1000);
          
          if (intervalEnd && checkoutDate >= intervalStart && checkoutDate < intervalEnd) {
            const dateStr = checkoutDay.toISOString().split('T')[0];
            const timeStr = `${String(intervalStart.getHours()).padStart(2, '0')}:${String(intervalStart.getMinutes()).padStart(2, '0')}`;
            const intervalKey = `${dateStr}_${timeStr}`;
            
            const interval = intervals.get(intervalKey);
            if (interval) {
              // Calculate duration
              const durationHours = (checkoutDate.getTime() - checkinDate.getTime()) / (1000 * 60 * 60);
              const bucket = getDurationBucket(durationHours);
              (interval.transactionsEnded as any)[bucket]++;
            }
            break;
          }
        }
      }
    }

    // Convert map to array and sort by date and time
    const processingEnd = Date.now();
    console.log('[transacties_voltooid] Processing transactions took', processingEnd - transactionsQueryStart, 'ms');
    
    const result = Array.from(intervals.values()).sort((a, b) => {
      const dateCompare = a.date.localeCompare(b.date);
      if (dateCompare !== 0) return dateCompare;
      return a.startTime.localeCompare(b.startTime);
    });

    const totalTime = Date.now() - startTime;
    console.log('[transacties_voltooid] API call completed successfully at', new Date().toISOString());
    console.log('[transacties_voltooid] Total time:', totalTime, 'ms');
    console.log('[transacties_voltooid] Returning', result.length, 'intervals');

    res.status(200).json(result);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error('[transacties_voltooid] Error in API call after', totalTime, 'ms:', error);
    res.status(500).json({ error: "Internal server error" });
  }
}

