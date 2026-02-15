
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { parse, addMinutes, format } from 'date-fns';

// Load .env.local manually
const loadEnv = () => {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (!fs.existsSync(envPath)) {
            console.error('.env.local not found at:', envPath);
            return {};
        }
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const env: Record<string, string> = {};
        envContent.split(/\r?\n/).forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                if (key && value) {
                    env[key] = value;
                }
            }
        });
        return env;
    } catch (e) {
        console.error('Error loading env:', e);
        return {};
    }
};

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    console.log('Available keys:', Object.keys(env)); // Debug
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function migrate() {
    console.log('--- Starting Migration from Timecards to Timecard Logs ---');

    // 1. Fetch all timecards for Jan 2026
    const startStr = '2026-01-01';
    const endStr = '2026-01-31';

    const { data: oldData, error: oldError } = await supabase
        .from('timecards')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr);

    if (oldError) {
        console.error('Error fetching timecards:', oldError.message);
        return;
    }

    if (!oldData || oldData.length === 0) {
        console.log('No timecards found to migrate for Jan 2026.');
        return;
    }

    console.log(`Found ${oldData.length} records to migrate.`);

    // 2. Convert to logs
    const logsToInsert: any[] = [];

    for (const card of oldData) {
        const date = card.date; // yyyy-mm-dd
        const staffId = card.staff_id;

        if (!card.clock_in || !card.clock_out) continue;

        let inTime: Date, outTime: Date;
        try {
            if (card.clock_in.length === 5) {
                inTime = parse(`${date} ${card.clock_in}`, 'yyyy-MM-dd HH:mm', new Date());
            } else {
                // Assume ISO or timestamp string if not HH:mm
                // Try to parse as date first
                const d = new Date(card.clock_in);
                if (!isNaN(d.getTime())) {
                    inTime = d;
                } else {
                    // Try combining date?
                    inTime = new Date(`${date}T${card.clock_in}`);
                }
            }

            if (card.clock_out.length === 5) {
                outTime = parse(`${date} ${card.clock_out}`, 'yyyy-MM-dd HH:mm', new Date());
            } else {
                const d = new Date(card.clock_out);
                if (!isNaN(d.getTime())) {
                    outTime = d;
                } else {
                    outTime = new Date(`${date}T${card.clock_out}`);
                }
            }
        } catch (e) {
            console.warn(`Skipping invalid time format for card ID ${card.id}: In:${card.clock_in} Out:${card.clock_out}`);
            continue;
        }

        if (isNaN(inTime.getTime()) || isNaN(outTime.getTime())) {
            console.warn(`Invalid date parsed for card ID ${card.id}: In:${card.clock_in} Out:${card.clock_out}`);
            continue;
        }

        logsToInsert.push({
            staff_id: staffId,
            event_type: 'clock_in',
            timestamp: inTime.toISOString()
        });

        // Break
        if (card.break_minutes && card.break_minutes > 0) {
            // Break Logic: Start at 12:00 or midpoint
            let breakStart = parse(`${date} 12:00`, 'yyyy-MM-dd HH:mm', new Date());

            if (breakStart < inTime || breakStart > outTime) {
                const mid = (inTime.getTime() + outTime.getTime()) / 2;
                breakStart = new Date(mid);
            }

            const breakEnd = addMinutes(breakStart, card.break_minutes);

            logsToInsert.push({
                staff_id: staffId,
                event_type: 'break_start',
                timestamp: breakStart.toISOString()
            });
            logsToInsert.push({
                staff_id: staffId,
                event_type: 'break_end',
                timestamp: breakEnd.toISOString()
            });
        }

        // Clock Out
        logsToInsert.push({
            staff_id: staffId,
            event_type: 'clock_out',
            timestamp: outTime.toISOString()
        });
    }

    // 3. Batch Insert
    console.log(`Prepared ${logsToInsert.length} log events.`);

    const batchSize = 100;
    let successCount = 0;
    for (let i = 0; i < logsToInsert.length; i += batchSize) {
        const batch = logsToInsert.slice(i, i + batchSize);
        const { error } = await supabase.from('timecard_logs').insert(batch);

        if (error) {
            console.error(`Error inserting batch ${i}:`, error.message);
        } else {
            successCount += batch.length;
            console.log(`Inserted batch ${i} - ${Math.min(i + batchSize, logsToInsert.length)}`);
        }
    }

    console.log('--- Migration Complete ---');
    console.log(`Successfully migrated ${successCount} events.`);

    // 4. Verification
    const { count } = await supabase
        .from('timecard_logs')
        .select('*', { count: 'exact', head: true })
        .gte('timestamp', `${startStr}T00:00:00`)
        .lte('timestamp', `${endStr}T23:59:59`);

    console.log(`Final Verification: ${count ?? 0} records in timecard_logs for Jan 2026.`);
}

migrate();
