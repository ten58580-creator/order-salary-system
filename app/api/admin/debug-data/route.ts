
import { createClient } from '@supabase/supabase-js';
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { parse, addMinutes, format } from 'date-fns';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'check';
    const year = parseInt(searchParams.get('year') || '2026');
    const month = parseInt(searchParams.get('month') || '1');
    const fix = searchParams.get('fix') === 'true'; // Force fix/migrate
    const key = searchParams.get('key'); // Bypass Key

    let supabase;
    let userId = 'system_bypass';

    // 1. Check Key FIRST (Bypass Auth & RLS)
    if (key === 'admin123') {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        // Try Service Role Key for RLS Bypass, fallback to Anon Key (might fail RLS but allow connection)
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

        supabase = createClient(supabaseUrl, supabaseServiceKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });
        console.log('Admin Bypass: Using Service Client');
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
                            // Ignored
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
        mode: key === 'admin123' ? 'admin_bypass' : 'authenticated_user'
    };

    try {
        if (action === 'check') {
            // Check Old Table
            const { count: oldCount, data: sampleOld } = await supabase
                .from('timecards')
                .select('*', { count: 'exact' })
                .gte('date', startStr)
                .lte('date', endStr)
                .limit(1);

            results.old_table = {
                count: oldCount,
                sample: sampleOld?.[0] || null
            };

            // Check New Table
            const { count: newCount, data: sampleNew } = await supabase
                .from('timecard_logs')
                .select('*', { count: 'exact' })
                .gte('timestamp', `${startStr}T00:00:00`)
                .lte('timestamp', `${endStr}T23:59:59`)
                .limit(1);

            results.new_table = {
                count: newCount,
                sample: sampleNew?.[0] || null
            };

            if (fix || searchParams.get('migrate') === 'true') {
                // Trigger Migration if requested
                if ((oldCount || 0) > 0 && (newCount || 0) === 0) {
                    results.migration_status = 'Starting Migration...';
                    const mResults = await migrateData(supabase, startStr, endStr);
                    results.migration_result = mResults;
                } else {
                    results.migration_status = 'Skipped: Conditions not met (Old > 0 AND New == 0) or migrate param not identical.';
                }
            }

        } else if (action === 'migrate') {
            const mResults = await migrateData(supabase, startStr, endStr);
            results.migration_result = mResults;

        } else if (action === 'seed') {
            // Seed Logic
            const seedResult = await seedData(supabase, userId, year, month);
            results.seed_result = seedResult;
        }

        return NextResponse.json(results);

    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}

async function migrateData(supabase: any, startStr: string, endStr: string) {
    const { data: oldData, error: oldError } = await supabase
        .from('timecards')
        .select('*')
        .gte('date', startStr)
        .lte('date', endStr);

    if (oldError) throw oldError;
    if (!oldData || oldData.length === 0) return { status: 'No data to migrate', count: 0 };

    const logsToInsert: any[] = [];
    const errors: any[] = [];

    for (const card of oldData) {
        if (!card.clock_in || !card.clock_out) continue;

        try {
            const date = card.date;
            // Parse Times
            // Assuming HH:mm
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
                event_type: 'clock_in',
                timestamp: inTime.toISOString()
            });

            if (card.break_minutes && card.break_minutes > 0) {
                // Break Logic
                let breakStart = parse(`${date} 12:00`, 'yyyy-MM-dd HH:mm', new Date());
                if (breakStart < inTime || breakStart > outTime) {
                    const mid = (inTime.getTime() + outTime.getTime()) / 2;
                    breakStart = new Date(mid);
                }
                const breakEnd = addMinutes(breakStart, card.break_minutes);

                logsToInsert.push({
                    staff_id: card.staff_id,
                    event_type: 'break_start',
                    timestamp: breakStart.toISOString()
                });
                logsToInsert.push({
                    staff_id: card.staff_id,
                    event_type: 'break_end',
                    timestamp: breakEnd.toISOString()
                });
            }

            logsToInsert.push({
                staff_id: card.staff_id,
                event_type: 'clock_out',
                timestamp: outTime.toISOString()
            });

        } catch (e: any) {
            errors.push({ id: card.id, msg: e.message });
        }
    }

    // Batch insert loop
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
    // 1. Get first staff (Try both tables to be safe with RLS)
    // If Admin Bypass, we can read any staff.
    const { data: staff } = await supabase.from('staff').select('id').limit(1).single();
    if (!staff) return { status: 'No staff found' };

    // 2. Generate logs for days 5-6
    const logs = [];
    for (let d = 5; d <= 6; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        logs.push(
            { staff_id: staff.id, event_type: 'clock_in', timestamp: `${dateStr}T09:00:00` },
            { staff_id: staff.id, event_type: 'break_start', timestamp: `${dateStr}T12:00:00` },
            { staff_id: staff.id, event_type: 'break_end', timestamp: `${dateStr}T13:00:00` },
            { staff_id: staff.id, event_type: 'clock_out', timestamp: `${dateStr}T18:00:00` }
        );
    }

    const { error } = await supabase.from('timecard_logs').insert(logs);
    if (error) throw error;

    return { status: 'Seeded', count: logs.length, staff_id: staff.id };
}
