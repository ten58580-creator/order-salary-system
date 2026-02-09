
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Helper to load env
const loadEnv = () => {
    try {
        const envPath = path.resolve(process.cwd(), '.env.local');
        const envContent = fs.readFileSync(envPath, 'utf-8');
        const env: Record<string, string> = {};
        envContent.split('\n').forEach(line => {
            const [key, value] = line.split('=');
            if (key && value) {
                env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
            }
        });
        return env;
    } catch (e) {
        console.error('Failed to load .env.local', e);
        return {};
    }
};

const env = loadEnv();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Starting Data Insertion...');

    const todayStr = new Date().toISOString().split('T')[0];

    let companyId: string | null = null;

    // 1. Ensure Company
    console.log('Ensuring Company...');
    try {
        const { data: companies, error: fetchErr } = await supabase.from('companies').select('id').limit(1);
        if (fetchErr) console.error('Company Fetch Error:', JSON.stringify(fetchErr));
        companyId = companies?.[0]?.id || null;

        if (!companyId) {
            console.log('Creating Company...');
            const { data: newComp, error } = await supabase.from('companies').insert({
                name: 'Test Company',
                address: 'Test Address',
                contact_info: 'Test Contact'
            }).select('id').single();
            if (error) {
                console.error('Company Insert Error:', JSON.stringify(error, null, 2));
                throw error;
            }
            companyId = newComp.id;
        }
        console.log('Company ID:', companyId);

        // 2. Ensure Staff
        console.log('Ensuring Staff...');
        const staffNames = ['Test', 'Test 2'];
        const staffIds: string[] = [];

        // Delete existing test staff to avoid conflicts
        console.log('Cleaning up existing test staff...');
        await supabase.from('staff').delete().in('name', staffNames);

        // Query existing PINs to avoid conflicts
        const { data: existingStaff } = await supabase.from('staff').select('pin');
        const existingPins = new Set((existingStaff || []).map(s => s.pin).filter(Boolean));
        console.log('Existing PINs:', Array.from(existingPins));

        // Create new staff with unique PINs
        for (let i = 0; i < staffNames.length; i++) {
            const name = staffNames[i];
            console.log(`Creating Staff ${name}...`);

            // Generate unique PIN
            let uniquePin = String(1000 + i).padStart(4, '0');
            let attempt = 1000 + i;
            while (existingPins.has(uniquePin)) {
                attempt++;
                uniquePin = String(attempt).padStart(4, '0');
            }
            existingPins.add(uniquePin); // Reserve this PIN

            const { data: newStaff, error } = await supabase.from('staff').insert({
                name,
                company_id: companyId,
                hourly_wage: 1100,
                role: 'staff',
                pin: uniquePin,
                dependents: 0,
                tax_category: '甲',
                note: ''
            }).select('id').single();
            if (error) {
                console.error('Staff Insert Error:', JSON.stringify(error, null, 2));
                throw error;
            }
            staffIds.push(newStaff.id);
            console.log(`Created ${name} with PIN ${uniquePin}`);
        }

        // 3. Insert Attendance
        console.log('Inserting Attendance...');
        const deleteRes = await supabase.from('timecard_logs').delete().in('staff_id', staffIds).gte('timestamp', todayStr + 'T00:00:00').lte('timestamp', todayStr + 'T23:59:59');
        if (deleteRes.error) console.error('Attendance Clear Error:', deleteRes.error);

        const workStart = `${todayStr}T09:00:00`;
        const workEnd = `${todayStr}T12:30:00`;

        for (const staffId of staffIds) {
            const { error: attError } = await supabase.from('timecard_logs').insert([
                { staff_id: staffId, event_type: 'clock_in', timestamp: workStart, company_id: companyId },
                { staff_id: staffId, event_type: 'clock_out', timestamp: workEnd, company_id: companyId }
            ]);
            if (attError) console.error('Attendance Insert Error:', attError);
        }

        // 4. Ensure Products
        console.log('Ensuring Products...');
        const productsToCheck = [
            { name: '商品A（ハンバーグ弁当）', price: 500 },
            { name: '商品B（ポテトサラダ）', price: 300 },
            { name: '商品C（チキン南蛮弁当）', price: 600 }
        ];
        const productIds: Record<string, string> = {};

        for (const p of productsToCheck) {
            const { data: existing } = await supabase.from('products').select('id').eq('name', p.name).single();
            if (existing) {
                productIds[p.name] = existing.id;
            } else {
                const { data: newP, error } = await supabase.from('products').insert({
                    name: p.name,
                    company_id: companyId,
                    unit_price: p.price
                }).select('id').single();
                if (error) {
                    console.error('Product Insert Error:', error);
                    throw error;
                }
                productIds[p.name] = newP.id;
            }
        }

        // 5. Insert Orders & Production Logs
        console.log('Inserting Orders & Production Logs...');
        const pIds = Object.values(productIds);

        // Cleanup old test data for today
        await supabase.from('production_logs').delete().in('product_id', pIds).gte('created_at', todayStr + 'T00:00:00');
        await supabase.from('orders').delete().in('product_id', pIds).eq('order_date', todayStr);

        // Helper
        const insertOrderLog = async (name: string, qty: number, start: string, end: string, workers: number) => {
            console.log(`Inserting Order/Log for ${name}...`);
            const { error: oErr } = await supabase.from('orders').insert({
                company_id: companyId,
                product_id: productIds[name],
                quantity: qty,
                actual_quantity: qty,
                order_date: todayStr,
                status: 'completed'
            });
            if (oErr) console.error('Order Insert Error:', oErr);

            const { error: lErr } = await supabase.from('production_logs').insert({
                product_id: productIds[name],
                order_date: todayStr,
                status: 'processing',
                start_time: start,
                end_time: end,
                worker_count: workers
            });
            if (lErr) console.error('Log Insert Error:', JSON.stringify(lErr, null, 2));
        };

        await insertOrderLog('商品A（ハンバーグ弁当）', 100, `${todayStr}T09:00:00`, `${todayStr}T10:00:00`, 1);
        await insertOrderLog('商品B（ポテトサラダ）', 200, `${todayStr}T09:00:00`, `${todayStr}T10:00:00`, 1);
        await insertOrderLog('商品C（チキン南蛮弁当）', 1000, `${todayStr}T10:00:00`, `${todayStr}T12:30:00`, 2);

        console.log('Done!');

    } catch (e) {
        console.error('MAIN CATCH:', e);
    }
}

main().catch(console.error);
