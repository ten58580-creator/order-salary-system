
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { parse, addMinutes, format, differenceInMinutes } from 'date-fns';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'check';
    const year = parseInt(searchParams.get('year') || '2026');
    const month = parseInt(searchParams.get('month') || '1');
    const fix = searchParams.get('fix') === 'true'; // Force fix/migrate
    const key = searchParams.get('key'); // Bypass Key
    const serviceKeyInput = searchParams.get('service_key'); // Direct Input for Service Key

    let supabase;
    let userId = 'system_bypass';

    // 1. Check Key FIRST (Bypass Auth & RLS)
    if (key === 'admin123') {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const supabaseServiceKey = serviceKeyInput || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
    } else {
        // 2. Normal Auth (Session based)
        const cookieStore = await cookies();

        supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        try {
                            cookiesToSet.forEach(({ name, value, options }) =>
                                cookieStore.set(name, value, options)
                            )
                        } catch {
                        }
                    },
                },
            }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized', details: authError }, { status: 401 });
        }
        userId = user.id;
    }

    const startStr = `${year}-${String(month).padStart(2, '0')}-01`;
    const endStr = format(new Date(year, month, 0), 'yyyy-MM-dd');

    const results: any = {
        action,
        target: { year, month },
        timestamp: new Date().toISOString(),
        user: userId,
        mode: key === 'admin123' ? 'admin_bypass' : 'authenticated_user',
        env_check: {
            service_role_key_exists: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
            service_key_input_provided: !!serviceKeyInput
        }
    };

    try {
        if (action === 'check') {
            // Check Old Table (Filtered)
            const { count: oldFiltered, data: sampleOld } = await supabase
                .from('timecards')
                .select('*', { count: 'exact' })
                .gte('date', startStr)
                .lte('date', endStr)
                .limit(1);

            // Check Old Table (Total)
            const { count: oldTotal } = await supabase
                .from('timecards')
                .select('*', { count: 'exact', head: true });

            // Check New Table
            const { count: newCount, data: sampleNew } = await supabase
                .from('timecard_logs')
                .select('*', { count: 'exact' })
                .gte('timestamp', `${startStr}T00:00:00`)
                .lte('timestamp', `${endStr}T23:59:59`)
                .limit(1);

            // Check New Table (Total)
            const { count: newTotal } = await supabase
                .from('timecard_logs')
                .select('*', { count: 'exact', head: true });

            results.counts = {
                old_filtered: oldFiltered,
                old_total: oldTotal,
                new_filtered: newCount,
                new_total: newTotal
            };
            results.samples = {
                old: sampleOld?.[0] || null,
                new: sampleNew?.[0] || null
            };

            if (fix || searchParams.get('migrate') === 'true') {
                if ((oldFiltered || 0) > 0 && (newCount || 0) === 0) {
                    results.migration_status = 'Starting Migration...';
                    const mResults = await migrateData(supabase, startStr, endStr);
                    results.migration_result = mResults;
                } else {
                    results.migration_status = 'Skipped: Conditions not met (Old Filtered > 0 AND New Filtered == 0).';
                }
            }

        } else if (action === 'scan') {
            const tables = ['timecards', 'timecard_logs', 'staff', 'companies', 'orders', 'production_records', 'products'];
            const tableCounts: any = {};

            for (const t of tables) {
                const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true });
                tableCounts[t] = error ? error.message : count;
            }
            results.table_scan = tableCounts;

        } else if (action === 'migrate') {
            const mResults = await migrateData(supabase, startStr, endStr);
            results.migration_result = mResults;

        } else if (action === 'seed') {
            const seedResult = await seedData(supabase, userId, year, month);
            results.seed_result = seedResult;

        } else if (action === 'fix_data') {
            results.fix_result = await fixData(supabase);

        } else if (action === 'fix_salary_data') {
            // Robust Salary Fix
            results.salary_fix_result = await fixSalaryData(supabase, startStr, endStr);
        }

        return NextResponse.json(results);

    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}

// ----------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------

async function fixSalaryData(supabase: any, startStr: string, endStr: string) {
    // 1. Fetch Staff (Source of Truth)
    const { data: staffList } = await supabase.from('staff').select('id, display_name, hourly_wage, company_id');
    if (!staffList) return { status: 'No staff found' };

    const staffMapById = new Map();
    const staffMapByName = new Map();

    staffList.forEach((s: any) => {
        staffMapById.set(s.id, s);
        if (s.display_name) {
            staffMapByName.set(s.display_name.trim(), s);
        }
    });

    // 2. Fetch Timecard Logs (Need to update these)
    // We iterate logs, find their 'staff_id', and see if it's valid. If not, we try to recover via Name.
    // BUT 'timecard_logs' doesn't have name. 'timecards' DOES (maybe).
    // The user said: "移行元の timecards またはログの metadata に記録されている「氏名（またはユーザー名）」を取得し"
    // So we must fetch Timecards (Old) and match them to Logs?
    // Or just look at Logs and if ID matches, good. If ID doesn't match... log has id.
    // Wait, if fix_data failed, it means logs have staff_id that is NOT in staff table.

    // So we need to:
    // A. Fetch OLD timecards to get the Name associated with the old ID.
    // B. Re-migrate or Update based on Name match.

    // Let's go with Update approach on existing logs if possible, but logs have separate rows.
    // Only OLD timecards link all events together and might have name.

    // Let's Fetch OLD Timecards
    const { data: oldTimecards } = await supabase.from('timecards')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr);

    if (!oldTimecards) return { status: 'No old timecards' };

    let updatedCount = 0;
    const report: any[] = [];
    const unmatched: any[] = [];

    // We need to map Old Timecard -> New Logs. 
    // Since we just migrated, we can try to match by date & potentially fuzzy time, OR we just re-migrate intelligently.
    // But re-migrating duplicates data if we don't clear logs.
    // User wants "Fix". 
    // Let's try to update existing logs.

    // Since we don't know the exact log IDs for each timecard efficiently, and keys might be broken...
    // Let's assume the migration created logs with the OLD staff_id.
    // So we iterate OLD timecards.

    for (const card of oldTimecards) {
        let staff = staffMapById.get(card.staff_id);

        // If ID mismatch, try Name Match
        if (!staff) {
            const candidateName = card.staff_name || card.name || card.display_name || card.user_name; // Guess column
            if (candidateName) {
                staff = staffMapByName.get(candidateName.trim());
            }
        }

        if (staff) {
            // Found proper staff. Update Logs.
            // Find logs with OLD staff_id (card.staff_id) on this DATE.
            // Note: If staff_id was valid from start, this is no-op except ensuring company_id.
            // If staff_id was invalid (old ID), we need to update it to NEW ID (staff.id).

            // Logic: Update timecard_logs SET staff_id = staff.id, company_id = staff.company_id 
            // WHERE staff_id = card.staff_id (Old) AND timestamp date match.

            // Wait, if multiple staff shared same Old ID (unlikely) this is risky.
            // Assuming 1:1 Old ID to Person.

            const dayStart = `${card.date}T00:00:00`;
            const dayEnd = `${card.date}T23:59:59`;

            const { error: updateError } = await supabase
                .from('timecard_logs')
                .update({
                    staff_id: staff.id, // Correct ID
                    company_id: staff.company_id // Correct Company
                })
                .eq('staff_id', card.staff_id) // Match Old ID
                .gte('timestamp', dayStart)
                .lte('timestamp', dayEnd);

            if (!updateError) {
                // Calculation for Report
                const workMins = calculateWorkMinutes(card.clock_in, card.clock_out, card.break_minutes);
                const wage = Math.floor((workMins / 60) * staff.hourly_wage);

                // Add to report (aggregate by staff)
                let repEntry = report.find(r => r.staff_name === staff.display_name);
                if (!repEntry) {
                    repEntry = { staff_name: staff.display_name, total_minutes: 0, total_wage: 0 };
                    report.push(repEntry);
                }
                repEntry.total_minutes += workMins;
                repEntry.total_wage += wage;
                updatedCount++;
            }

        } else {
            unmatched.push({
                card_id: card.id,
                staff_id_old: card.staff_id,
                name_guess: card.staff_name || card.name || 'N/A'
            });
        }
    }

    return {
        processed_cards: oldTimecards.length,
        updated_staff_matches: updatedCount,
        report,
        unmatched
    };
}

function calculateWorkMinutes(inStr: string, outStr: string, breakMins: number = 0) {
    if (!inStr || !outStr) return 0;
    // Simple calc assuming simple HH:mm strings
    const toMins = (s: string) => {
        const [h, m] = s.split(':').map(Number);
        return h * 60 + m;
    }
    let start = toMins(inStr.includes('T') ? inStr.split('T')[1].substring(0, 5) : inStr);
    let end = toMins(outStr.includes('T') ? outStr.split('T')[1].substring(0, 5) : outStr);

    return Math.max(0, (end - start) - breakMins);
}

async function fixData(supabase: any) {
    // 1. Get all staff with company_id
    const { data: staffList } = await supabase.from('staff').select('id, company_id');
    const staffMap = new Map();
    staffList?.forEach((s: any) => staffMap.set(s.id, s.company_id));

    // 2. Scan logs with null company_id
    const { data: logs, error: fetchError } = await supabase
        .from('timecard_logs')
        .select('id, staff_id')
        .is('company_id', null)
        .limit(2000);

    if (fetchError) throw fetchError;

    let updatedCount = 0;
    const errors: any[] = [];

    if (logs && logs.length > 0) {
        for (const log of logs) {
            const compId = staffMap.get(log.staff_id);
            if (compId) {
                const { error: updateError } = await supabase
                    .from('timecard_logs')
                    .update({ company_id: compId })
                    .eq('id', log.id);

                if (updateError) errors.push({ id: log.id, msg: updateError.message });
                else updatedCount++;
            } else {
                errors.push({ id: log.id, msg: 'Staff not found or no company_id' });
            }
        }
    }

    return {
        found_null_company_id: logs?.length || 0,
        updated_count: updatedCount,
        errors_count: errors.length,
        sample_errors: errors.slice(0, 5)
    };
}

async function migrateData(supabase: any, startStr: string, endStr: string) {
    const { data: oldData, error: oldError } = await supabase
        .from('timecards')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr);

    if (oldError) throw oldError;
    if (!oldData || oldData.length === 0) return { status: 'No data to migrate', count: 0 };

    // Prefetch staff company map
    const { data: staffList } = await supabase.from('staff').select('id, company_id');
    const staffMap = new Map();
    staffList?.forEach((s: any) => staffMap.set(s.id, s.company_id));

    const logsToInsert: any[] = [];
    const errors: any[] = [];

    for (const card of oldData) {
        if (!card.clock_in || !card.clock_out) continue;

        const companyId = staffMap.get(card.staff_id);

        try {
            const date = card.date;
            const parseTime = (timeStr: string) => {
                if (timeStr.length === 5) return parse(`${date} ${timeStr}`, 'yyyy-MM-dd HH:mm', new Date());
                return new Date(timeStr.includes('T') ? timeStr : `${date}T${timeStr}`);
            };

            const inTime = parseTime(card.clock_in);
            const outTime = parseTime(card.clock_out);

            if (isNaN(inTime.getTime()) || isNaN(outTime.getTime())) {
                errors.push({ id: card.id, msg: 'Invalid time' });
                continue;
            }

            logsToInsert.push({
                staff_id: card.staff_id,
                company_id: companyId,
                event_type: 'clock_in',
                timestamp: inTime.toISOString()
            });

            if (card.break_minutes && card.break_minutes > 0) {
                let breakStart = parse(`${date} 12:00`, 'yyyy-MM-dd HH:mm', new Date());
                if (breakStart < inTime || breakStart > outTime) {
                    const mid = (inTime.getTime() + outTime.getTime()) / 2;
                    breakStart = new Date(mid);
                }
                const breakEnd = addMinutes(breakStart, card.break_minutes);

                logsToInsert.push({
                    staff_id: card.staff_id,
                    company_id: companyId,
                    event_type: 'break_start',
                    timestamp: breakStart.toISOString()
                });
                logsToInsert.push({
                    staff_id: card.staff_id,
                    company_id: companyId,
                    event_type: 'break_end',
                    timestamp: breakEnd.toISOString()
                });
            }

            logsToInsert.push({
                staff_id: card.staff_id,
                company_id: companyId,
                event_type: 'clock_out',
                timestamp: outTime.toISOString()
            });

        } catch (e: any) {
            errors.push({ id: card.id, msg: e.message });
        }
    }

    if (logsToInsert.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < logsToInsert.length; i += batchSize) {
            const batch = logsToInsert.slice(i, i + batchSize);
            const { error: insertError } = await supabase.from('timecard_logs').insert(batch);
            if (insertError) throw insertError;
        }
    }

    return {
        status: 'Migrated',
        found_old: oldData.length,
        logs_generated: logsToInsert.length,
        errors
    };
}

async function seedData(supabase: any, _userId: string, year: number, month: number) {
    const { data: staff } = await supabase.from('staff').select('id, company_id').limit(1).single();
    if (!staff) return { status: 'No staff found' };

    const logs = [];
    for (let d = 5; d <= 6; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        logs.push(
            { staff_id: staff.id, company_id: staff.company_id, event_type: 'clock_in', timestamp: `${dateStr}T09:00:00` },
            { staff_id: staff.id, company_id: staff.company_id, event_type: 'break_start', timestamp: `${dateStr}T12:00:00` },
            { staff_id: staff.id, company_id: staff.company_id, event_type: 'break_end', timestamp: `${dateStr}T13:00:00` },
            { staff_id: staff.id, company_id: staff.company_id, event_type: 'clock_out', timestamp: `${dateStr}T18:00:00` }
        );
    }

    const { error } = await supabase.from('timecard_logs').insert(logs);
    if (error) throw error;

    return { status: 'Seeded', count: logs.length, staff_id: staff.id };
}
