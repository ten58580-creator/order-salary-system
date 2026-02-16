
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const serviceKeyInput = searchParams.get('service_key');
    const action = searchParams.get('action'); // 'force_link' or 'sync_company'

    // Auth Check
    if (key !== 'admin123') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = serviceKeyInput || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
    });

    try {
        if (action === 'sync_company') {
            const result = await syncCompanyIds(supabase);
            return NextResponse.json(result);
        } else if (action === 'force_link') {
            const result = await forceLinkStaff(supabase);
            return NextResponse.json(result);
        } else {
            return NextResponse.json({
                status: 'Debug API Active',
                available_actions: ['force_link', 'sync_company']
            });
        }
    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}

async function syncCompanyIds(supabase: any) {
    // 1. Fetch Staff to get correct Company IDs, selecting ALL columns to avoid missing column error
    const { data: staffList, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw staffError;

    // Detect Name Column
    const sampleStaff = staffList[0] || {};
    const staffKeys = Object.keys(sampleStaff);
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name', 'employee_name'].includes(k)) || 'id';

    let updatedCount = 0;
    const errors = [];
    const details = [];

    // 2. Update timecard_logs for each staff
    for (const staff of staffList) {
        if (!staff.company_id) continue;
        const staffName = staff[nameColumn] || staff.id;

        const { count, error } = await supabase
            .from('timecard_logs')
            .update({ company_id: staff.company_id })
            .eq('staff_id', staff.id)
            .select('*', { count: 'exact', head: true });

        if (error) {
            errors.push({ staff: staffName, msg: error.message });
        } else {
            updatedCount += (count || 0);
            details.push({ staff: staffName, count: count, company_id: staff.company_id });
        }
    }

    return {
        status: 'Company ID Sync Completed',
        total_logs_updated: updatedCount,
        details,
        errors
    };
}

async function forceLinkStaff(supabase: any) {
    // 1. Fetch ALL Staff (New IDs)
    const { data: staffList, error: staffError } = await supabase.from('staff').select('*');
    if (staffError) throw staffError;

    // Build Maps for Name Matching
    const normalize = (s: string) => s ? String(s).replace(/\s+/g, '').toLowerCase() : '';
    const nameToNewStaff = new Map();

    const sampleStaff = staffList[0] || {};
    const staffKeys = Object.keys(sampleStaff);
    const nameColumn = staffKeys.find(k => ['display_name', 'name', 'full_name', 'user_name', 'username', 'staff_name', 'employee_name'].includes(k)) || 'id';

    staffList.forEach((s: any) => {
        const norm = normalize(s[nameColumn]);
        if (norm) nameToNewStaff.set(norm, s);
    });

    // 2. Fetch OLD Timecards to get the mapping (Old ID -> Name)
    const { data: oldTimecards, error: oldError } = await supabase.from('timecards').select('staff_id, staff_name, name, display_name, user_name, employee_name');
    if (oldError) throw oldError;

    const oldStaffMap = new Map(); // Old ID -> Name List
    oldTimecards.forEach((card: any) => {
        if (!oldStaffMap.has(card.staff_id)) {
            const names = [card.staff_name, card.name, card.display_name, card.user_name, card.employee_name].filter(Boolean);
            oldStaffMap.set(card.staff_id, names);
        }
    });

    const details = [];
    let updatedGroups = 0;

    // 3. Execute Updates based on Name Matching
    for (const [oldId, names] of oldStaffMap.entries()) {
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
            // Update using OLD ID match
            const { error: updateError } = await supabase
                .from('timecard_logs')
                .update({
                    staff_id: matchedNewStaff.id,
                    company_id: matchedNewStaff.company_id
                })
                .eq('staff_id', oldId);

            details.push({
                old_id: oldId,
                matched_name: matchName,
                new_id: matchedNewStaff.id,
                result: updateError ? updateError.message : 'Sent update'
            });
            updatedGroups++;
        }
    }

    return {
        status: 'Name Linking Executed',
        matched_groups: updatedGroups,
        details
    };
}
