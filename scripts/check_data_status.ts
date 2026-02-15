
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load .env.local manually
const loadEnv = () => {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        if (!fs.existsSync(envPath)) return {};
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const env: Record<string, string> = {};
        envContent.split(/\r?\n/).forEach(line => {
            const parts = line.split('=');
            if (parts.length >= 2) {
                const key = parts[0].trim();
                const value = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
                if (key && value) env[key] = value;
            }
        });
        return env;
    } catch (e) { return {}; }
};

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
    console.log('--- Checking Global Data Status ---');

    // 1. timecards (Old) - Check latest
    const { data: oldData, error: oldError } = await supabase
        .from('timecards')
        .select('*')
        .order('date', { ascending: false })
        .limit(5);

    if (oldError) console.error('Error fetching timecards:', oldError.message);
    else {
        console.log(`[Timecards (Old)] Latest 5 records:`);
        if (oldData && oldData.length > 0) {
            oldData.forEach(d => console.log(`  Date: ${d.date}, Staff: ${d.staff_id}, In: ${d.clock_in}, Out: ${d.clock_out}`));
        } else {
            console.log('  No records found in timecards table.');
        }
    }

    // Check total count
    const { count: oldCount } = await supabase.from('timecards').select('*', { count: 'exact', head: true });
    console.log(`[Timecards (Old)] Total count: ${oldCount}`);


    // 2. timecard_logs (New) - Check latest
    const { data: newData, error: newError } = await supabase
        .from('timecard_logs')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(5);

    if (newError) console.error('Error fetching timecard_logs:', newError.message);
    else {
        console.log(`[Timecard Logs (New)] Latest 5 records:`);
        if (newData && newData.length > 0) {
            newData.forEach(d => console.log(`  Time: ${d.timestamp}, Staff: ${d.staff_id}, Event: ${d.event_type}`));
        } else {
            console.log('  No records found in timecard_logs table.');
        }
    }

    const { count: newCount } = await supabase.from('timecard_logs').select('*', { count: 'exact', head: true });
    console.log(`[Timecard Logs (New)] Total count: ${newCount}`);
}

checkData();
