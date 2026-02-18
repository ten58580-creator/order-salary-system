import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const executeFix = searchParams.get('execute_fix') === 'true';

    // 1. Setup Supabase Client with User's Cookies (to get SESSION Company ID)
    const cookieStore = cookies();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!; // Fallback strictly for dev if needed, typically Service Key required for updates

    // Dictionary to allow cookie access in createClient
    // Note: Standard createClient doesn't automatically parse cookies from Next.js headers easily without helpers.
    // We construct a client that includes the cookie header.
    const supabaseUserClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
            headers: {
                cookie: cookieStore.toString(),
            },
        },
        auth: {
            detectSessionInUrl: false,
            persistSession: false,
            autoRefreshToken: false,
        }
    });

    // 2. Client for Admin Operations (Update Data)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        }
    });

    try {
        // 3. Get User Session & Derived Company ID
        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser();

        let sessionSummary = {
            user_id: user?.id || 'No User Session Found',
            email: user?.email,
            company_id_from_metadata: user?.user_metadata?.company_id || 'N/A',
            company_id_from_staff_table: 'Not Found',
            is_admin_session: !!user
        };

        let TRUE_COMPANY_ID = null;

        if (user) {
            // Fetch from staff table to be sure what the UI is using
            // UI often does: const { data: staff } = supabase.from('staff').select('company_id').eq('id', user.id) or similar.
            // Actually UI uses list of staff. Let's find ANY staff entry associated with this account or just the user's entry.
            // The previous code showed UI fetches ALL staff and takes staff[0].company_id.
            // Let's try to find the staff record for this user first.
            const { data: staffMe } = await supabaseAdmin.from('staff').select('company_id').eq('id', user.id).single();
            if (staffMe) {
                sessionSummary.company_id_from_staff_table = staffMe.company_id;
                TRUE_COMPANY_ID = staffMe.company_id;
            } else {
                // If user is not in staff table (admin account?), maybe we should take the FIRST staff's company_id as the "UI View"
                const { data: anyStaff } = await supabaseAdmin.from('staff').select('company_id').limit(1);
                if (anyStaff && anyStaff.length > 0) {
                    sessionSummary.company_id_from_staff_table = anyStaff[0].company_id + ' (Fallback: 1st Staff)';
                    TRUE_COMPANY_ID = anyStaff[0].company_id;
                }
            }
        }

        // 4. Get Current Data Company ID (from logs)
        // Find Shirokama's log if possible, or any log.
        const { data: logsSample } = await supabaseAdmin.from('timecard_logs').select('company_id, staff_id').limit(5);
        const dataCompanyIds = Array.from(new Set(logsSample?.map((l: any) => l.company_id)));

        const statusOfData = {
            ids_found_in_logs: dataCompanyIds,
            count_in_logs: logsSample?.length,
            match_status: 'Checking...'
        };

        if (!TRUE_COMPANY_ID) {
            return NextResponse.json({
                error: 'Could not determine Session Company ID. Please log in.',
                session: sessionSummary
            });
        }

        const isMatch = dataCompanyIds.length === 1 && dataCompanyIds[0] === TRUE_COMPANY_ID;
        statusOfData.match_status = isMatch ? 'MATCH' : 'MISMATCH - CRITICAL';

        let fixResult = null;

        // 5. Execute Fix if requested and Mismatch (or forced)
        if (executeFix && TRUE_COMPANY_ID) {
            // UPDATE timecard_logs
            const { error: logUpdateError, count: logCount } = await supabaseAdmin
                .from('timecard_logs')
                .update({ company_id: TRUE_COMPANY_ID })
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Update ALL

            // UPDATE staff (Critical for UI consistency)
            const { error: staffUpdateError, count: staffCount } = await supabaseAdmin
                .from('staff')
                .update({ company_id: TRUE_COMPANY_ID })
                .neq('id', '00000000-0000-0000-0000-000000000000'); // Update ALL

            fixResult = {
                status: 'FIX EXECUTED',
                target_company_id: TRUE_COMPANY_ID,
                logs_updated: logCount || 'Unknown (check count)',
                staff_updated: staffCount || 'Unknown',
                errors: {
                    log: logUpdateError?.message,
                    staff: staffUpdateError?.message
                }
            };
        }

        return NextResponse.json({
            check_result: {
                session_company_id: TRUE_COMPANY_ID,
                data_company_ids: dataCompanyIds,
                status: statusOfData.match_status
            },
            session_debug: sessionSummary,
            fix_result: fixResult,
            instructions: isMatch ? 'Data is consistent.' : 'CRITICAL MISMATCH. Run with ?execute_fix=true to sync data to Session ID.'
        });

    } catch (e: any) {
        return NextResponse.json({ error: e.message, stack: e.stack }, { status: 500 });
    }
}
