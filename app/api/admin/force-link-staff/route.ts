
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const serviceKeyInput = searchParams.get('service_key');

    // Auth Check
    if (key !== 'admin123') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = serviceKeyInput || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        const result = await forceLinkStaff(supabase);
        return NextResponse.json(result);
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}

async function forceLinkStaff(supabase: any) {
    // 1. Fetch ALL Staff (New IDs)
    const { data: staffList, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw staffError;

    // Build Maps for Name Matching
    const normalize = (s: string) => s ? String(s).replace(/\s+/g, '').toLowerCase() : '';
    const nameToNewStaff = new Map();
    const updatedLogCounts = new Map();

    // Column detection helper logic copied from previous success
    const sampleStaff = staffList[0] || {};
    const staffKeys = Object.keys(sampleStaff);
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name'].includes(k)) || 'id';

    staffList.forEach((s: any) => {
        const norm = normalize(s[nameColumn]);
        if (norm) nameToNewStaff.set(norm, s);
    });

    // 2. Fetch OLD Timecards to get the mapping (Old ID -> Name)
    // We assume timecard_logs currently has OLD IDs or Partial IDs.
    // We will iterate OLD timecards, find the name, find the New Staff ID, and update logs that match the OLD Timecard's Staff ID.
    const { data: oldTimecards, error: oldError } = await supabase.from('timecards').select('staff_id, staff_name, name, display_name, user_name, employee_name');
    if (oldError) throw oldError;

    // Distinct Old Staff IDs
    const oldStaffMap = new Map(); // Old ID -> Name List
    oldTimecards.forEach((card: any) => {
        if (!oldStaffMap.has(card.staff_id)) {
            const names = [card.staff_name, card.name, card.display_name, card.user_name, card.employee_name].filter(Boolean);
            oldStaffMap.set(card.staff_id, names);
        }
    });

    let totalUpdates = 0;
    const details = [];

    // 3. Execute Updates
    for (const [oldId, names] of oldStaffMap.entries()) {
        // Find matching new staff
        let matchedNewStaff = null;
        let matchName = '';

        for (const name of names) {
            const norm = normalize(name);
            if (nameToNewStaff.has(norm)) {
                matchedNewStaff = nameToNewStaff.get(norm);
                matchName = name;
                break;
            }
        }

        if (matchedNewStaff) {
            // Update timecard_logs where staff_id = oldId to matchedNewStaff.id
            // AND also update company_id while we are at it

            // Check if Old ID != New ID to avoid redundant updates (optional, but safer to just update)
            const { count, error: updateError } = await supabase
                .from('timecard_logs')
                .update({
                    staff_id: matchedNewStaff.id,
                    company_id: matchedNewStaff.company_id
                })
                .eq('staff_id', oldId)
                .select('*', { count: 'exact', head: true }); // We want to know how many rows affected

            // Note: Supabase update doesn't return count easily without select.
            // Actually, we can just assume success if no error.
            // But to get count we might need a separate query or trust the return.

            // Let's rely on a separate query to count *potential* targets? No, expensive.
            // Just fire the update.
            // We can't easily get "rows affected" via standard postgrest-js without 'select' and returning data, which is heavy.
            // Let's just log the attempt.

            details.push({
                old_id: oldId,
                matched_name: matchName,
                new_id: matchedNewStaff.id,
                result: updateError ? updateError.message : 'Update command sent'
            });
        } else {
            details.push({
                old_id: oldId,
                names_tried: names,
                result: 'No matching staff found in new table'
            });
        }
    }

    return {
        status: 'Force Link Logic Executed',
        details
    };
}
