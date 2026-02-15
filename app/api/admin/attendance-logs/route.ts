
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Force dynamic to bypass cache
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const start = searchParams.get('start');
    const end = searchParams.get('end');

    if (!start || !end) {
        return NextResponse.json({ error: 'Missing start or end params' }, { status: 400 });
    }

    // Use Service Role Key to bypass RLS
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });

    try {
        const { data: logsData, error: logsError } = await supabase
            .from('timecard_logs')
            .select('*')
            .gte('timestamp', start)
            .lte('timestamp', end)
            .order('timestamp', { ascending: true });

        if (logsError) throw logsError;

        return NextResponse.json({ data: logsData });

    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
